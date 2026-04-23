import { base } from "$app/paths";
import { redirect } from "@sveltejs/kit";
import { triggerLoginFlow } from "$lib/server/auth";

export async function GET(event) {
	if (event.locals.user) {
		const next = event.url.searchParams.get("next");
		if (next?.startsWith("/")) {
			return redirect(302, next);
		}
		return redirect(302, `${base}/`);
	}

	return await triggerLoginFlow(event);
}
