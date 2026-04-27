import { fail } from "@sveltejs/kit";
import { loginEnabled } from "$lib/server/auth";
import { getBetterAuth } from "$lib/server/betterAuth";
import { config } from "$lib/server/config";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	return { loginEnabled };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const email = String(data.get("email") ?? "").trim();

		if (!email) {
			return fail(400, { error: "Email is required." });
		}

		if (!loginEnabled) {
			return fail(503, { error: "Auth is not configured." });
		}

		try {
			const ba = await getBetterAuth();
			const origin = config.BETTER_AUTH_URL || config.PUBLIC_ORIGIN || "http://localhost:5173";
			await ba.api.requestPasswordReset({
				body: { email, redirectTo: `${origin}/reset-password` },
				headers: request.headers,
			});
		} catch {
			// Always show success to prevent email enumeration
		}

		return { success: true };
	},
};
