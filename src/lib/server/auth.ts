import crypto from "crypto";
import type { RequestEvent } from "@sveltejs/kit";
import { redirect, type Cookies } from "@sveltejs/kit";
import { addWeeks } from "date-fns";
import { dev } from "$app/environment";
import { base } from "$app/paths";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "$lib/server/database";
import { config } from "$lib/server/config";
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

/** PIN auth is always enabled. loginEnabled is kept as an export for compat. */
export const loginEnabled = true;

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

function getSafeNext(url: URL): string {
	return sanitizeReturnPath(url.searchParams.get("next")) ?? `${base}/`;
}

export async function authenticateRequest(
	request: Request,
	cookie: Cookies,
	_url: URL,
	_isApi?: boolean
): Promise<App.Locals & { secretSessionId: string }> {
	const token = cookie.get(config.COOKIE_NAME);

	let secretSessionId = token || crypto.randomUUID();
	let sessionId = await sha256(secretSessionId);

	// Check for trusted header auth (reverse proxy)
	let email = null;
	if (config.TRUSTED_EMAIL_HEADER) {
		email = request.headers.get(config.TRUSTED_EMAIL_HEADER);
	}

	if (email) {
		// Trusted header mode — auto-create user from header
		const user = await collections.users.findOne({
			authProvider: "trusted-header",
			authSubject: email,
		});
		if (user) {
			// Update session
			await collections.sessions.deleteOne({ sessionId });
			secretSessionId = crypto.randomUUID();
			sessionId = await sha256(secretSessionId);
			refreshSessionCookie(cookie, secretSessionId);

			await collections.sessions.insertOne({
				_id: new ObjectId(),
				sessionId,
				userId: user._id,
				createdAt: new Date(),
				updatedAt: new Date(),
				expiresAt: addWeeks(new Date(), 2),
			});

			return {
				user,
				sessionId,
				secretSessionId,
				isAdmin: user.isAdmin ?? false,
			};
		}

		// Create user from trusted header
		const userId = new ObjectId();
		const newUser: User = {
			_id: userId,
			name: email,
			email,
			username: email.split("@")[0],
			avatarUrl: undefined,
			authProvider: "trusted-header",
			authSubject: email,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		await collections.users.insertOne(newUser);

		await collections.sessions.insertOne({
			_id: new ObjectId(),
			sessionId,
			userId,
			createdAt: new Date(),
			updatedAt: new Date(),
			expiresAt: addWeeks(new Date(), 2),
		});

		return {
			user: newUser,
			sessionId,
			secretSessionId,
			isAdmin: false,
		};
	}

	// Existing session cookie — look up user
	if (token) {
		const result = await findUser(sessionId, await getCoupledCookieHash(cookie));

		if (result.user) {
			// Rotate session
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

	// No auth — anonymous session
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
