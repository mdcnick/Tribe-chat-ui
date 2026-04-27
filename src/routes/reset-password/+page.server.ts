import { fail, redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import { loginEnabled } from "$lib/server/auth";
import { getBetterAuth } from "$lib/server/betterAuth";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get("token");
	return { loginEnabled, token, hasToken: !!token };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const newPassword = String(data.get("password") ?? "");
		const confirm = String(data.get("confirm") ?? "");
		const token = String(data.get("token") ?? "");

		if (!newPassword || !token) {
			return fail(400, { error: "Missing required fields.", expired: false });
		}

		if (newPassword.length < 8) {
			return fail(400, { error: "Password must be at least 8 characters.", expired: false });
		}

		if (newPassword !== confirm) {
			return fail(400, { error: "Passwords do not match.", expired: false });
		}

		if (!loginEnabled) {
			return fail(503, { error: "Auth is not configured.", expired: false });
		}

		try {
			const ba = await getBetterAuth();
			await ba.api.resetPassword({
				body: { newPassword, token },
				headers: request.headers,
			});
		} catch (err) {
			const msg =
				err && typeof err === "object" && "body" in err
					? (err.body as { message?: string })?.message
					: undefined;

			if (msg?.toLowerCase().includes("expired") || msg?.toLowerCase().includes("invalid")) {
				return fail(400, {
					error: "This link has expired. Request a new one.",
					expired: true,
				});
			}

			return fail(400, {
				error: msg ?? "Could not reset password. Please try again.",
				expired: false,
			});
		}

		throw redirect(302, `${base}/login?message=password-reset`);
	},
};
