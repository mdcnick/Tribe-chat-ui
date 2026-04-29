import { fail, redirect } from "@sveltejs/kit";
import { registerWithPin } from "$lib/server/pinAuth";
import { refreshSessionCookie } from "$lib/server/auth";
import type { Actions, PageServerLoad } from "./$types";
import { base } from "$app/paths";
import { loginEnabled } from "$lib/server/auth";

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) {
		throw redirect(302, `${base}/`);
	}

	return {
		loginEnabled,
		next: url.searchParams.get("next") || `${base}/`,
	};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const formData = await request.formData();
		const username = (formData.get("username") as string)?.trim().toLowerCase() || undefined;
		const pin = formData.get("pin") as string;
		const confirmPin = formData.get("confirmPin") as string;
		const email = (formData.get("email") as string)?.trim() || undefined;

		if (!pin) {
			return fail(400, { error: "PIN is required.", username: username ?? "", email: email ?? "" });
		}

		if (!/^\d{10}$/.test(pin)) {
			return fail(400, {
				error: "PIN must be exactly 10 digits.",
				username: username ?? "",
				email: email ?? "",
			});
		}

		if (pin !== confirmPin) {
			return fail(400, {
				error: "PINs don't match.",
				username: username ?? "",
				email: email ?? "",
			});
		}

		if (email) {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(email)) {
				return fail(400, { error: "Invalid email format.", username: username ?? "", email });
			}
		}

		try {
			const { secretSessionId, recoveryPhrase } = await registerWithPin({ username, pin, email });
			refreshSessionCookie(cookies, secretSessionId);

			// Store recovery phrase in session so we can show it once
			cookies.set("recovery_phrase", recoveryPhrase, {
				path: "/",
				httpOnly: true,
				sameSite: "lax",
				maxAge: 300, // 5 minutes — only long enough to display once
			});

			throw redirect(302, `${base}/recovery-phrase`);
		} catch (err) {
			if (err && typeof err === "object" && "status" in err) throw err; // re-throw SvelteKit redirects
			const message = err instanceof Error ? err.message : "Registration failed.";
			return fail(409, { error: message, username: username ?? "", email: email ?? "" });
		}
	},
};
