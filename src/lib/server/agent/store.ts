import { collections } from "$lib/server/database";
import type { AgentSession } from "$lib/types/AgentSession";
import { ObjectId } from "mongodb";

export async function createAgentSession(doc: Omit<AgentSession, "_id">): Promise<AgentSession> {
	const col = (await collections).agentSessions;
	const result = await col.insertOne({
		...doc,
		_id: new ObjectId(),
	});
	return { ...doc, _id: result.insertedId };
}

export async function getAgentSession(userId: string): Promise<AgentSession | null> {
	const col = (await collections).agentSessions;
	return col.findOne({ userId });
}

export async function updateAgentSession(
	userId: string,
	update: Partial<AgentSession>
): Promise<void> {
	const col = (await collections).agentSessions;
	await col.updateOne({ userId }, { $set: update });
}

export async function deleteAgentSession(userId: string): Promise<void> {
	const col = (await collections).agentSessions;
	await col.deleteOne({ userId });
}

export async function upsertAgentSession(
	userId: string,
	doc: Omit<AgentSession, "_id" | "userId">
): Promise<AgentSession> {
	const col = (await collections).agentSessions;
	const result = await col.findOneAndUpdate(
		{ userId },
		{ $set: { userId, ...doc } },
		{ upsert: true, returnDocument: "after" }
	);
	const doc_ = result ?? null;
	if (!doc_) {
		throw new Error(`upsertAgentSession returned no document for userId=${userId}`);
	}
	return doc_;
}
