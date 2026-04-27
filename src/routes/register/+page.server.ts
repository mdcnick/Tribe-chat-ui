import { fail, redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { loginEnabled } from "$lib/server/auth";
import { getBetterAuth, setAuthSessionCookie } from "$lib/server/betterAuth";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(302, `${base}/`);
	}
	return { loginEnabled };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const name = String(data.get("name") ?? "").trim();
		const email = String(data.get("email") ?? "").trim();
		const password = String(data.get("password") ?? "");

		if (!name || !email || !password) {
			return fail(400, { error: "All fields are required.", name, email });
		}

		if (password.length < 8) {
			return fail(400, { error: "Password must be at least 8 characters.", name, email });
		}

		if (!loginEnabled) {
			return fail(503, { error: "Registration is not configured.", name, email });
		}

		try {
			const ba = await getBetterAuth();
			const result = await ba.api.signUpEmail({
				body: { name, email, password },
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

			if (msg?.toLowerCase().includes("already") || msg?.toLowerCase().includes("exist")) {
				return fail(409, {
					error: "An account with this email already exists. Sign in instead.",
					name,
					email,
				});
			}

			return fail(400, {
				error: msg ?? "Could not create account. Please try again.",
				name,
				email,
			});
		}

		throw redirect(302, `${base}/`);
	},
};
