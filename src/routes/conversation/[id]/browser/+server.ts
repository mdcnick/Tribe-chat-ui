import { authCondition } from "$lib/server/auth";
import { browserSessionStore } from "$lib/server/browser/sessionStore";
import { logger } from "$lib/server/logger";
import { collections } from "$lib/server/database";
import { error } from "@sveltejs/kit";
import { ObjectId } from "mongodb";

export async function POST({ params, locals }) {
	if (!locals.user && !locals.sessionId) {
		error(401, "Unauthorized");
	}

	const conversationId = new ObjectId(params.id);

	const conversation = await collections.conversations.findOne({
		_id: conversationId,
		...authCondition(locals),
	});

	if (!conversation) {
		error(404, "Conversation not found");
	}

	try {
		await browserSessionStore.release(conversationId.toString(), "manual-close");
	} catch (err) {
		logger.warn(
			{ conversationId: conversationId.toString(), err },
			"[steel] failed to release browser session during manual close"
		);
	}

	return new Response();
}
