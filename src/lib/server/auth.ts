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
import { adminTokenManager } from "./adminToken";
import {
	authenticateClerkRequest,
	clerkLoginEnabled,
	clerkSignInUrl,
	getClerkUser,
	mapClerkSessionClaimsProfile,
	mapClerkUserProfile,
} from "./clerk";
import { config } from "$lib/server/config";
import { logger } from "$lib/server/logger";
import type { User } from "$lib/types/User";
import { sha256 } from "$lib/utils/sha256";
import { syncAuthenticatedUser } from "./syncAuthenticatedUser";

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

export const loginEnabled = clerkLoginEnabled;

function sanitizeReturnPath(path: string | undefined | null): string | undefined {
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

function getClerkSignInTarget(next: string, url: URL) {
	const signInUrl = clerkSignInUrl;
	if (!signInUrl) {
		throw error(503, "Clerk login is not configured. Set PUBLIC_CLERK_SIGN_IN_URL.");
	}

	const redirectUrl = new URL(next, config.PUBLIC_ORIGIN || url.origin).toString();
	const target = new URL(signInUrl);
	target.searchParams.set("redirect_url", redirectUrl);
	return target.toString();
}

export async function authenticateRequest(
	request: Request,
	cookie: Cookies,
	url: URL,
	isApi?: boolean
): Promise<App.Locals & { secretSessionId: string; clerkResponseHeaders?: Headers }> {
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

	const clerkAuth = await authenticateClerkRequest(request, url);
	if (clerkAuth.isAuthenticated && clerkAuth.clerkUserId) {
		let profile = mapClerkSessionClaimsProfile(clerkAuth.clerkUserId, clerkAuth.sessionClaims);

		if (config.CLERK_SECRET_KEY) {
			try {
				const clerkUser = await getClerkUser(clerkAuth.clerkUserId);
				profile = mapClerkUserProfile(clerkUser);
			} catch (err) {
				logger.warn(
					{ err, clerkUserId: clerkAuth.clerkUserId },
					"Falling back to Clerk session claims because getUser() failed"
				);
			}
		}

		if (!isAllowedAuthenticatedEmail(profile.email)) {
			logger.warn(
				{ clerkUserId: clerkAuth.clerkUserId, email: profile.email },
				"Blocked Clerk user"
			);
			throw error(403, "User not allowed");
		}

		const synced = await syncAuthenticatedUser({
			...profile,
			cookies: cookie,
			currentSessionId: sessionId,
			currentSecretSessionId: secretSessionId,
			locals: {
				sessionId,
				isAdmin: false,
			},
			userAgent: request.headers.get("user-agent") ?? undefined,
			ip: undefined,
		});

		return {
			user: synced.user,
			sessionId: synced.sessionId,
			secretSessionId: synced.secretSessionId,
			isAdmin: synced.user.isAdmin ?? false,
			clerkResponseHeaders: clerkAuth.responseHeaders,
			clerkAuth: {
				clerkUserId: clerkAuth.clerkUserId,
				clerkSessionId: clerkAuth.clerkSessionId,
			},
		};
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
				clerkResponseHeaders: clerkAuth.responseHeaders,
			};
		} else if (result.invalidateSession) {
			secretSessionId = crypto.randomUUID();
			sessionId = await sha256(secretSessionId);
			refreshSessionCookie(cookie, secretSessionId);
		}
	}

	if (isApi && request.headers.get("Authorization")?.startsWith("Bearer ")) {
		logger.warn(
			"Ignoring deprecated bearer-token auth path because Clerk is the canonical provider"
		);
	}

	return {
		user: undefined,
		sessionId,
		secretSessionId,
		isAdmin: false,
		clerkResponseHeaders: clerkAuth.responseHeaders,
	};
}

export async function triggerLoginFlow({ url }: RequestEvent): Promise<Response> {
	throw redirect(302, getClerkSignInTarget(getSafeNext(url), url));
}

export async function handleLegacyLoginCallback({ url }: RequestEvent): Promise<Response> {
	const next = sanitizeReturnPath(url.searchParams.get("next")) ?? `${base}/`;
	throw redirect(302, next);
}
