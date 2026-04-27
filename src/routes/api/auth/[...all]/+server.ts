import { getBetterAuth } from "$lib/server/betterAuth";
import type { RequestHandler } from "./$types";

async function handler(event: Parameters<RequestHandler>[0]): Promise<Response> {
	const ba = await getBetterAuth();
	return ba.handler(event.request);
}

export const GET: RequestHandler = handler;
export const POST: RequestHandler = handler;
