import { redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const recoveryPhrase = cookies.get("recovery_phrase");

	if (!recoveryPhrase) {
		// No recovery phrase cookie — either already seen or not registered yet
		throw redirect(302, `${base}/`);
	}

	// Delete the cookie immediately so it can only be seen once
	cookies.delete("recovery_phrase", { path: "/" });

	return {
		recoveryPhrase,
		username: locals.user?.username ?? "your account",
	};
};
