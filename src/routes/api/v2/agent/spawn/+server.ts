import { json } from "@sveltejs/kit";
import { spawnAgent } from "$lib/server/agent/spawn";
import { getAgentSession, upsertAgentSession } from "$lib/server/agent/store";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals }) => {
	const userId = locals.user?._id.toString();
	if (!userId) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const existing = await getAgentSession(userId);
	if (existing?.status === "running") {
		return json(existing);
	}

	let spawned;
	try {
		spawned = await spawnAgent(userId);
		if (!spawned.hostPorts?.desktop || !spawned.hostPorts?.ptyHttp || !spawned.hostPorts?.ptyWs) {
			return json({ error: "Agent spawn returned invalid ports" }, { status: 500 });
		}
	} catch (e) {
		return json({ error: "Failed to spawn agent" }, { status: 500 });
	}

	const session = await upsertAgentSession(userId, {
		containerId: spawned.containerId,
		containerName: spawned.containerName,
		desktopUrl: `http://localhost:${spawned.hostPorts.desktop}`,
		ptyHttpUrl: `http://localhost:${spawned.hostPorts.ptyHttp}`,
		ptyWsUrl: `ws://localhost:${spawned.hostPorts.ptyWs}`,
		status: "running",
		createdAt: new Date(),
	});

	return json(session);
};
