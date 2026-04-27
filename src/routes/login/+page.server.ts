import { fail, redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { loginEnabled, sanitizeReturnPath } from "$lib/server/auth";
import { getBetterAuth, setAuthSessionCookie } from "$lib/server/betterAuth";
import { config } from "$lib/server/config";
import type { Actions, PageServerLoad } from "./$types";

function sanitizeNext(raw: string | null): string {
	return sanitizeReturnPath(raw) ?? `${base}/`;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) {
		throw redirect(302, sanitizeNext(url.searchParams.get("next")));
	}

	const githubEnabled = !!(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET);
	const googleEnabled = !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);

	return {
		loginEnabled,
		githubEnabled,
		googleEnabled,
		next: sanitizeNext(url.searchParams.get("next")),
		error: url.searchParams.get("error"),
		message: url.searchParams.get("message"),
	};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = String(data.get("email") ?? "").trim();
		const password = String(data.get("password") ?? "");
		const next = sanitizeNext(data.get("next") as string | null);

		if (!email || !password) {
			return fail(400, { error: "Email and password are required.", email });
		}

		if (!loginEnabled) {
			return fail(503, { error: "Login is not configured.", email });
		}

		try {
			const ba = await getBetterAuth();
			const result = await ba.api.signInEmail({
				body: { email, password },
				headers: request.headers,
			});

			if (result?.token) {
				setAuthSessionCookie(cookies, result.token);
			}
		} catch (err) {
			const msg =
				err && typeof err === "object" && "body" in err
					? (err.body as { message?: string })?.message
					: undefined;
			return fail(401, {
				error: msg ?? "Invalid email or password.",
				email,
			});
		}

		throw redirect(302, next);
	},
};
