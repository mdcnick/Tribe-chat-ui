import type { ObjectId } from "mongodb";
import type { Message } from "./Message";
import type { Timestamps } from "./Timestamps";
import type { User } from "./User";
import type { Assistant } from "./Assistant";

export interface Conversation extends Timestamps {
	_id: ObjectId;

	sessionId?: string;
	userId?: User["_id"];

	model: string;

	title: string;
	rootMessageId?: Message["id"];
	messages: Message[];

	meta?: {
		fromShareId?: string;
	};

	preprompt?: string;
	assistantId?: Assistant["_id"];

	userAgent?: string;

	// Encrypted messages blob — replaces `messages` when conversations are encrypted at rest.
	// When present, `messages` is an empty array and the actual content is stored here.
	_em?: string;
}
