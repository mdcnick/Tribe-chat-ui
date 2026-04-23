import { triggerLoginFlow } from "$lib/server/auth";

export async function GET(event) {
	return await triggerLoginFlow(event);
}
