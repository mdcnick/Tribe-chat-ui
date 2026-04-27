import crypto from "crypto";
import type { RequestEvent } from "@sveltejs/kit";
import { error, redirect, type Cookies } from "@sveltejs/kit";
import { addWeeks } from "date-fns";
import { dev } from "$app/environment";
import { base } from "$app/paths";
import { ObjectId } from "mongodb";
import JSON5 from "json5";
import { z } from "zod";
import { collections } from "$lib/server/database";
import { DEFAULT_SETTINGS } from "$lib/types/Settings";
import { adminTokenManager } from "./adminToken";
import { betterAuthEnabled, getBetterAuth, mapBetterAuthUser } from "./betterAuth";
import { config } from "$lib/server/config";
import { logger } from "$lib/server/logger";
import type { User } from "$lib/types/User";
import { sha256 } from "$lib/utils/sha256";

const sameSite = z
	.enum(["lax", "none", "strict"])
	.default(dev || config.ALLOW_INSECURE_COOKIES === "true" ? "lax" : "none")
	.parse(config.COOKIE_SAMESITE === "" ? undefined : config.COOKIE_SAMESITE);

const secure = z
	.boolean()
	.default(!(dev || config.ALLOW_INSECURE_COOKIES === "true"))
	.parse(config.COOKIE_SECURE === "" ? undefined : config.COOKIE_SECURE === "true");

const sanitizeJSONEnv = (val: string, fallback: string) => {
	const raw = (val ?? "").trim();
	const unquoted = raw.startsWith("`") && raw.endsWith("`") ? raw.slice(1, -1) : raw;
	return unquoted || fallback;
};

const allowedUserEmails = z
	.array(z.string().email())
	.optional()
	.default([])
	.parse(JSON5.parse(sanitizeJSONEnv(config.ALLOWED_USER_EMAILS, "[]")));

const allowedUserDomains = z
	.array(z.string())
	.optional()
	.default([])
	.parse(JSON5.parse(sanitizeJSONEnv(config.ALLOWED_USER_DOMAINS, "[]")));

export const loginEnabled = betterAuthEnabled;

export function sanitizeReturnPath(path: string | undefined | null): string | undefined {
	if (!path) {
		return undefined;
	}
	if (path.startsWith("//")) {
		return undefined;
	}
	if (!path.startsWith("/")) {
		return undefined;
	}
	return path;
}

export function refreshSessionCookie(cookies: Cookies, sessionId: string) {
	cookies.set(config.COOKIE_NAME, sessionId, {
		path: "/",
		sameSite,
		secure,
		httpOnly: true,
		expires: addWeeks(new Date(), 2),
	});
}

export async function getCoupledCookieHash(cookie: Cookies): Promise<string | undefined> {
	if (!config.COUPLE_SESSION_WITH_COOKIE_NAME) {
		return undefined;
	}

	const cookieValue = cookie.get(config.COUPLE_SESSION_WITH_COOKIE_NAME);

	if (!cookieValue) {
		return "no-cookie";
	}

	return await sha256(cookieValue);
}

export async function findUser(
	sessionId: string,
	coupledCookieHash: string | undefined
): Promise<{
	user: User | null;
	invalidateSession: boolean;
}> {
	const session = await collections.sessions.findOne({ sessionId });

	if (!session) {
		return { user: null, invalidateSession: false };
	}

	if (coupledCookieHash && session.coupledCookieHash !== coupledCookieHash) {
		return { user: null, invalidateSession: true };
	}

	return {
		user: await collections.users.findOne({ _id: session.userId }),
		invalidateSession: false,
	};
}

export const authCondition = (locals: App.Locals) => {
	if (!locals.user && !locals.sessionId) {
		throw new Error("User or sessionId is required");
	}

	return locals.user
		? { userId: locals.user._id }
		: { sessionId: locals.sessionId, userId: { $exists: false } };
};

function buildAnonymousUserFromTrustedHeader(email: string, sessionId: string): User {
	return {
		_id: new ObjectId(sessionId.slice(0, 24)),
		name: email,
		email,
		createdAt: new Date(),
		updatedAt: new Date(),
		authProvider: "trusted-header",
		authSubject: email,
		hfUserId: email,
		avatarUrl: "",
	};
}

function isAllowedAuthenticatedEmail(email: string | undefined): boolean {
	if (allowedUserEmails.length === 0 && allowedUserDomains.length === 0) {
		return true;
	}

	if (!email) {
		return false;
	}

	const domain = email.split("@")[1];
	return allowedUserEmails.includes(email) || allowedUserDomains.includes(domain);
}

function getSafeNext(url: URL): string {
	return sanitizeReturnPath(url.searchParams.get("next")) ?? `${base}/`;
}

/** Upsert our MongoDB user record for a Better Auth session. Migrates anonymous data on first sign-in. */
async function syncBetterAuthUser(
	profile: {
		authProvider: "better-auth";
		authSubject: string;
		email: string;
		name: string;
		avatarUrl?: string;
	},
	anonymousSessionId: string | undefined
): Promise<User> {
	const { authProvider, authSubject, email, name, avatarUrl } = profile;
	const now = new Date();

	let user = await collections.users.findOne({ authProvider, authSubject });
	const patch = { email, name, avatarUrl, updatedAt: now, authProvider, authSubject };

	if (user) {
		await collections.users.updateOne({ _id: user._id }, { $set: patch });
		user = { ...user, ...patch };
	} else {
		const newUser: User = {
			_id: new ObjectId(),
			createdAt: now,
			...patch,
		};
		const insert = await collections.users.insertOne(newUser);
		user = { ...newUser, _id: insert.insertedId };
	}

	if (anonymousSessionId) {
		const settingsForUser = await collections.settings.findOne({ userId: user._id });
		if (!settingsForUser) {
			const { matchedCount } = await collections.settings.updateOne(
				{ sessionId: anonymousSessionId },
				{ $set: { userId: user._id, updatedAt: now }, $unset: { sessionId: "" } }
			);
			if (!matchedCount) {
				await collections.settings.insertOne({
					userId: user._id,
					updatedAt: now,
					createdAt: now,
					...DEFAULT_SETTINGS,
				});
			}
		}

		const { modifiedCount } = await collections.conversations.updateMany(
			{ sessionId: anonymousSessionId, userId: { $exists: false } },
			{ $set: { userId: user._id }, $unset: { sessionId: "" } }
		);
		if (modifiedCount > 0) {
			logger.info(
				{ userId: user._id.toString(), migratedConversationCount: modifiedCount },
				"Migrated anonymous conversations to authenticated user"
			);
		}
	}

	return user;
}

export async function authenticateRequest(
	request: Request,
	cookie: Cookies,
	url: URL,
	isApi?: boolean
): Promise<App.Locals & { secretSessionId: string }> {
	const token = cookie.get(config.COOKIE_NAME);

	let email = null;
	if (config.TRUSTED_EMAIL_HEADER) {
		email = request.headers.get(config.TRUSTED_EMAIL_HEADER);
	}

	let secretSessionId = token || crypto.randomUUID();
	let sessionId = await sha256(secretSessionId);

	if (email) {
		return {
			user: buildAnonymousUserFromTrustedHeader(email, sessionId),
			sessionId,
			secretSessionId,
			isAdmin: adminTokenManager.isAdmin(sessionId),
		};
	}

	if (betterAuthEnabled) {
		try {
			const ba = await getBetterAuth();
			const baSession = await ba.api.getSession({ headers: request.headers });

			if (baSession?.user) {
				const profile = mapBetterAuthUser(baSession.user);

				if (!isAllowedAuthenticatedEmail(profile.email)) {
					logger.warn(
						{ authSubject: profile.authSubject, email: profile.email },
						"Blocked Better Auth user"
					);
					throw error(403, "User not allowed");
				}

				const anonymousSessionId = token ? await sha256(token) : undefined;
				const user = await syncBetterAuthUser(profile, anonymousSessionId);

				return {
					user,
					sessionId: baSession.session.id,
					secretSessionId: baSession.session.token,
					isAdmin: user.isAdmin ?? false,
				};
			}
		} catch (err) {
			if (err && typeof err === "object" && "status" in err) {
				throw err;
			}
			logger.warn(err, "Failed to validate Better Auth session");
		}
	}

	if (token) {
		const result = await findUser(sessionId, await getCoupledCookieHash(cookie));

		if (result.user) {
			await collections.sessions.deleteOne({ sessionId });
			secretSessionId = crypto.randomUUID();
			sessionId = await sha256(secretSessionId);
			refreshSessionCookie(cookie, secretSessionId);

			await collections.sessions.insertOne({
				_id: new ObjectId(),
				sessionId,
				userId: result.user._id,
				createdAt: new Date(),
				updatedAt: new Date(),
				expiresAt: addWeeks(new Date(), 2),
			});

			return {
				user: result.user,
				sessionId,
				secretSessionId,
				isAdmin: result.user.isAdmin ?? false,
			};
		} else if (result.invalidateSession) {
			secretSessionId = crypto.randomUUID();
			sessionId = await sha256(secretSessionId);
			refreshSessionCookie(cookie, secretSessionId);
		}
	}

	if (isApi && request.headers.get("Authorization")?.startsWith("Bearer ")) {
		logger.warn("Ignoring deprecated bearer-token auth — Better Auth is the canonical provider");
	}

	return {
		user: undefined,
		sessionId,
		secretSessionId,
		isAdmin: false,
	};
}

export async function triggerLoginFlow({ url }: RequestEvent): Promise<Response> {
	const next = getSafeNext(url);
	throw redirect(302, `${base}/login?next=${encodeURIComponent(next)}`);
}

export async function handleLegacyLoginCallback({ url }: RequestEvent): Promise<Response> {
	const next = sanitizeReturnPath(url.searchParams.get("next")) ?? `${base}/`;
	throw redirect(302, next);
}
