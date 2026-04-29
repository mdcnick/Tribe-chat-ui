import type { RequestHandler } from "./$types";
import { dev } from "$app/environment";
import { base } from "$app/paths";
import { collections } from "$lib/server/database";
import { redirect } from "@sveltejs/kit";
import { config } from "$lib/server/config";

async function logout({ locals, cookies }: Parameters<RequestHandler>[0]) {
	await collections.sessions.deleteOne({ sessionId: locals.sessionId });

	cookies.delete(config.COOKIE_NAME, {
		path: "/",
		sameSite: dev || config.ALLOW_INSECURE_COOKIES === "true" ? "lax" : "none",
		secure: !dev && !(config.ALLOW_INSECURE_COOKIES === "true"),
		httpOnly: true,
	});

	return redirect(302, `${base}/`);
}

export async function POST(event) {
	return logout(event);
}

export async function GET(event) {
	return logout(event);
}
