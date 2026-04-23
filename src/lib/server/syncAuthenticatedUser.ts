import crypto from "crypto";
import { addWeeks } from "date-fns";
import { dev } from "$app/environment";
import type { Cookies } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { config } from "$lib/server/config";
import { collections } from "$lib/server/database";
import { DEFAULT_SETTINGS } from "$lib/types/Settings";
import type { AuthProvider, User } from "$lib/types/User";
import { sha256 } from "$lib/utils/sha256";
import { logger } from "$lib/server/logger";

const sameSite = z
	.enum(["lax", "none", "strict"])
	.default(dev || config.ALLOW_INSECURE_COOKIES === "true" ? "lax" : "none")
	.parse(config.COOKIE_SAMESITE === "" ? undefined : config.COOKIE_SAMESITE);

const secure = z
	.boolean()
	.default(!(dev || config.ALLOW_INSECURE_COOKIES === "true"))
	.parse(config.COOKIE_SECURE === "" ? undefined : config.COOKIE_SECURE === "true");

function refreshSessionCookie(cookies: Cookies, sessionId: string) {
	cookies.set(config.COOKIE_NAME, sessionId, {
		path: "/",
		sameSite,
		secure,
		httpOnly: true,
		expires: addWeeks(new Date(), 2),
	});
}

async function getCoupledCookieHash(cookie: Cookies): Promise<string | undefined> {
	if (!config.COUPLE_SESSION_WITH_COOKIE_NAME) {
		return undefined;
	}

	const cookieValue = cookie.get(config.COUPLE_SESSION_WITH_COOKIE_NAME);

	if (!cookieValue) {
		return "no-cookie";
	}

	return await sha256(cookieValue);
}

export async function syncAuthenticatedUser(params: {
	authProvider: AuthProvider;
	authSubject: string;
	username?: string;
	name: string;
	email?: string;
	avatarUrl?: string;
	cookies: Cookies;
	currentSessionId: string;
	currentSecretSessionId: string;
	locals: App.Locals;
	userAgent?: string;
	ip?: string;
}) {
	const {
		authProvider,
		authSubject,
		username,
		name,
		email,
		avatarUrl,
		cookies,
		currentSessionId,
		currentSecretSessionId,
		locals,
		userAgent,
		ip,
	} = params;

	let user =
		(await collections.users.findOne({
			authProvider,
			authSubject,
		})) ??
		(authProvider === "legacy-oidc" || authProvider === "trusted-header"
			? await collections.users.findOne({ hfUserId: authSubject })
			: null);

	const now = new Date();
	const userPatch = {
		username,
		name,
		email,
		avatarUrl,
		updatedAt: now,
		authProvider,
		authSubject,
	};

	if (user) {
		await collections.users.updateOne({ _id: user._id }, { $set: userPatch });
		user = { ...user, ...userPatch };
	} else {
		const createdUser: User = {
			_id: new ObjectId(),
			createdAt: now,
			updatedAt: now,
			username,
			name,
			email,
			avatarUrl,
			authProvider,
			authSubject,
		};

		const insert = await collections.users.insertOne(createdUser);
		user = { ...createdUser, _id: insert.insertedId };
	}

	const currentSession = await collections.sessions.findOne({ sessionId: currentSessionId });
	if (currentSession?.userId?.toString() === user._id.toString()) {
		locals.user = user;
		locals.sessionId = currentSessionId;
		return {
			user,
			sessionId: currentSessionId,
			secretSessionId: currentSecretSessionId,
			rotated: false,
		};
	}

	const previousSessionId = currentSessionId;
	const nextSecretSessionId = crypto.randomUUID();
	const nextSessionId = await sha256(nextSecretSessionId);

	if (await collections.sessions.findOne({ sessionId: nextSessionId })) {
		throw new Error("Session ID collision");
	}

	const coupledCookieHash = await getCoupledCookieHash(cookies);

	await collections.sessions.deleteOne({ sessionId: previousSessionId });
	await collections.sessions.insertOne({
		_id: new ObjectId(),
		sessionId: nextSessionId,
		userId: user._id,
		createdAt: now,
		updatedAt: now,
		userAgent,
		ip,
		expiresAt: addWeeks(now, 2),
		...(coupledCookieHash ? { coupledCookieHash } : {}),
	});

	const settingsForUser = await collections.settings.findOne({ userId: user._id });
	if (!settingsForUser) {
		const { matchedCount } = await collections.settings.updateOne(
			{ sessionId: previousSessionId },
			{
				$set: { userId: user._id, updatedAt: now },
				$unset: { sessionId: "" },
			}
		);

		if (!matchedCount) {
			await collections.settings.insertOne({
				userId: user._id,
				updatedAt: now,
				createdAt: now,
				...DEFAULT_SETTINGS,
			});
		}
	} else {
		await collections.settings.updateOne(
			{ sessionId: previousSessionId, userId: { $exists: false } },
			{
				$set: { userId: user._id, updatedAt: now },
				$unset: { sessionId: "" },
			}
		);
	}

	const conversationsMigration = await collections.conversations.updateMany(
		{ sessionId: previousSessionId, userId: { $exists: false } },
		{
			$set: { userId: user._id },
			$unset: { sessionId: "" },
		}
	);

	if (conversationsMigration.modifiedCount > 0) {
		logger.info(
			{
				userId: user._id.toString(),
				migratedConversationCount: conversationsMigration.modifiedCount,
			},
			"Migrated anonymous conversations to authenticated user"
		);
	}

	refreshSessionCookie(cookies, nextSecretSessionId);

	locals.user = user;
	locals.sessionId = nextSessionId;

	return {
		user,
		sessionId: nextSessionId,
		secretSessionId: nextSecretSessionId,
		rotated: true,
	};
}
