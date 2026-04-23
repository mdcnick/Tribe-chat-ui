import type { Cookies } from "@sveltejs/kit";
import { z } from "zod";
import { logger } from "$lib/server/logger";
import { syncAuthenticatedUser } from "$lib/server/syncAuthenticatedUser";

export async function updateUser(params: {
	userData: Record<string, unknown>;
	locals: App.Locals;
	cookies: Cookies;
	userAgent?: string;
	ip?: string;
}) {
	const { userData, locals, cookies, userAgent, ip } = params;

	const parsed = z
		.object({
			preferred_username: z.string().optional(),
			name: z.string().optional(),
			picture: z.string().optional(),
			sub: z.string(),
			email: z.string().email().optional(),
		})
		.refine((data) => data.preferred_username || data.email || data.name, {
			message: "User data must include a display field",
		})
		.parse(userData);

	logger.warn(
		"Legacy updateUser() path is deprecated. Use syncAuthenticatedUser() with Clerk instead."
	);

	return syncAuthenticatedUser({
		authProvider: "legacy-oidc",
		authSubject: parsed.sub,
		username: parsed.preferred_username,
		name: parsed.name || parsed.preferred_username || parsed.email || parsed.sub,
		email: parsed.email,
		avatarUrl: parsed.picture,
		currentSessionId: locals.sessionId,
		currentSecretSessionId: locals.sessionId,
		cookies,
		locals,
		userAgent,
		ip,
	});
}
