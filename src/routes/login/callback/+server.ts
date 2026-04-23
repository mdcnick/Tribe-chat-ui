import { handleLegacyLoginCallback } from "$lib/server/auth";

export async function GET(event) {
	return handleLegacyLoginCallback(event);
}
