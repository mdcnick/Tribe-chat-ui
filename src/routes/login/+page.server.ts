import { fail, redirect } from "@sveltejs/kit";
import { loginWithPin } from "$lib/server/pinAuth";
import { refreshSessionCookie } from "$lib/server/auth";
import type { Actions, PageServerLoad } from "./$types";
import { base } from "$app/paths";
import { loginEnabled } from "$lib/server/auth";

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) {
		throw redirect(302, url.searchParams.get("next") || `${base}/`);
	}

	return {
		loginEnabled,
		next: url.searchParams.get("next") || `${base}/`,
		error: url.searchParams.get("error"),
	};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const username = (formData.get("username") as string)?.trim().toLowerCase();
		const pin = formData.get("pin") as string;
		const next = (formData.get("next") as string) || `${base}/`;

		if (!username || !pin) {
			return fail(400, { error: "Username and PIN are required.", username });
		}

		if (!/^\d{10}$/.test(pin)) {
			return fail(400, { error: "PIN must be exactly 10 digits.", username });
		}

		try {
			const { secretSessionId } = await loginWithPin(username, pin);
			refreshSessionCookie(cookies, secretSessionId);

			throw redirect(302, next);
		} catch (err) {
			// Re-throw SvelteKit redirects
			if (err && typeof err === "object" && "status" in err) throw err;
			const message = err instanceof Error ? err.message : "Login failed.";
			return fail(401, { error: message, username });
		}
	},
};
