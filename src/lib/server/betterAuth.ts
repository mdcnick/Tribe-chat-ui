import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { building, dev } from "$app/environment";
import type { Cookies } from "@sveltejs/kit";
import { Database } from "$lib/server/database";
import { config } from "$lib/server/config";
import { logger } from "$lib/server/logger";

export const betterAuthEnabled = !building && !!config.BETTER_AUTH_SECRET;

export const BA_SESSION_COOKIE = "better-auth.session_token";
export const BA_SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _auth: ReturnType<typeof betterAuth<any>> | undefined;

export async function getBetterAuth() {
	if (!_auth) {
		if (building) throw new Error("Better Auth not available during build");

		const db = await Database.getInstance();
		const dbName = config.MONGODB_DB_NAME + (import.meta.env.MODE === "test" ? "-test" : "");

		_auth = betterAuth({
			database: mongodbAdapter(db.getClient().db(dbName), {
				transaction: false,
			}),
			baseURL: config.BETTER_AUTH_URL || config.PUBLIC_ORIGIN || "http://localhost:5173",
			secret: config.BETTER_AUTH_SECRET,
			emailAndPassword: {
				enabled: true,
				sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
					logger.info(
						{ email: user.email, url },
						"Password reset token generated — configure email sending via SMTP to deliver this"
					);
				},
			},
			socialProviders: {
				...(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET
					? {
							github: {
								clientId: config.GITHUB_CLIENT_ID,
								clientSecret: config.GITHUB_CLIENT_SECRET,
							},
						}
					: {}),
				...(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
					? {
							google: {
								clientId: config.GOOGLE_CLIENT_ID,
								clientSecret: config.GOOGLE_CLIENT_SECRET,
							},
						}
					: {}),
			},
		});
	}

	if (!_auth) throw new Error("Better Auth failed to initialize");
	return _auth;
}

export function mapBetterAuthUser(baUser: {
	id: string;
	email: string;
	name: string;
	image?: string | null;
}) {
	return {
		authProvider: "better-auth" as const,
		authSubject: baUser.id,
		email: baUser.email,
		name: baUser.name,
		avatarUrl: baUser.image ?? undefined,
	};
}

export function setAuthSessionCookie(cookies: Cookies, token: string) {
	cookies.set(BA_SESSION_COOKIE, token, {
		path: "/",
		httpOnly: true,
		secure: !dev && config.ALLOW_INSECURE_COOKIES !== "true",
		sameSite: dev || config.ALLOW_INSECURE_COOKIES === "true" ? "lax" : "none",
		maxAge: BA_SESSION_MAX_AGE,
	});
}

export function clearAuthSessionCookie(cookies: Cookies) {
	cookies.delete(BA_SESSION_COOKIE, {
		path: "/",
		httpOnly: true,
		secure: !dev && config.ALLOW_INSECURE_COOKIES !== "true",
		sameSite: dev || config.ALLOW_INSECURE_COOKIES === "true" ? "lax" : "none",
	});
}
