/**
 * Conversation field-level encryption middleware.
 *
 * Encrypts/decrypts sensitive conversation fields before writing to / after reading from MongoDB.
 *
 * Strategy: Instead of encrypting individual message fields (which would break
 * all the per-update mutations that happen during streaming), we encrypt the
 * entire `messages` array and `title` as opaque blobs. The model name,
 * timestamps, and metadata are left in plaintext for querying and sorting.
 *
 * Plain text conversations (anonymous users or pre-encryption data) are detected
 * by the absence of the `_em` field and passed through unchanged.
 */

import { encryptField, decryptField, isEncrypted, getDek } from "$lib/server/convoCrypto";
import type { Conversation } from "$lib/types/Conversation";
import type { SharedConversation } from "$lib/types/SharedConversation";

/**
 * Encrypt conversation fields before writing to MongoDB.
 * Modifies the conversation object in-place and returns it.
 * If the user has no DEK cached, fields are left as plaintext (anonymous users).
 */
export function encryptConversation(conv: Conversation, userId: string): Conversation {
	const dek = getDek(userId);
	if (!dek) return conv; // Anonymous user — no encryption

	// Encrypt title
	if (conv.title && !isEncrypted(conv.title)) {
		conv.title = encryptField(conv.title, userId) ?? conv.title;
	}

	// Encrypt preprompt
	if (conv.preprompt && !isEncrypted(conv.preprompt)) {
		conv.preprompt = encryptField(conv.preprompt, userId) ?? conv.preprompt;
	}

	// Encrypt the entire messages array as a single blob
	if (conv.messages && conv.messages.length > 0 && !conv._em) {
		const messagesJson = JSON.stringify(conv.messages);
		const encrypted = encryptField(messagesJson, userId);
		if (encrypted) {
			conv._em = encrypted;
			conv.messages = []; // Replace with empty array — actual content is in _em
		}
	}

	return conv;
}

/**
 * Decrypt conversation fields after reading from MongoDB.
 * Modifies the conversation object in-place and returns it.
 * If the user has no DEK cached, encrypted fields remain as-is
 * (the UI will see garbled titles and empty messages).
 */
export function decryptConversation(conv: Conversation, userId: string): Conversation {
	// Decrypt title
	if (conv.title && isEncrypted(conv.title)) {
		conv.title = decryptField(conv.title, userId);
	}

	// Decrypt preprompt
	if (conv.preprompt && isEncrypted(conv.preprompt)) {
		conv.preprompt = decryptField(conv.preprompt, userId);
	}

	// Decrypt messages blob
	if (conv._em) {
		const decrypted = decryptField(conv._em, userId);
		try {
			conv.messages = JSON.parse(decrypted);
		} catch {
			// If parsing fails, leave messages as empty (decryption failed)
			conv.messages = [];
		}
		delete conv._em;
	}

	return conv;
}

/**
 * Decrypt only the title field (for list views that don't need messages).
 */
export function decryptConversationTitle<T extends Pick<Conversation, "title">>(
	conv: T,
	userId: string
): T {
	if (conv.title && isEncrypted(conv.title)) {
		return { ...conv, title: decryptField(conv.title, userId) };
	}
	return conv;
}

/**
 * Prepare a shared conversation: fully decrypted copy for sharing.
 * Shared conversations are stored unencrypted since they're accessible via hash.
 */
export function prepareSharedConversation(
	conv: Conversation,
	userId: string
): Omit<SharedConversation, "_id" | "hash"> {
	// Work on a copy
	const copy = JSON.parse(JSON.stringify(conv)) as Conversation;
	const decrypted = decryptConversation(copy, userId);

	return {
		model: decrypted.model,
		title: decrypted.title,
		rootMessageId: decrypted.rootMessageId,
		messages: decrypted.messages,
		preprompt: decrypted.preprompt,
		createdAt: decrypted.createdAt,
		updatedAt: decrypted.updatedAt,
	};
}
