import { AbortedGenerations } from "$lib/server/abortedGenerations";

/**
 * Robust abort-error detection that covers AbortSignal, OpenAI SDK, and transport-level aborts.
 */
export function isAbortError(err: unknown): boolean {
	if (err instanceof Error) {
		if (err.name === "AbortError" || err.name === "APIUserAbortError") {
			return true;
		}
		const msg = err.message;
		if (
			msg === "Request was aborted." ||
			msg === "This operation was aborted" ||
			msg.includes("AbortError") ||
			msg.includes("APIUserAbortError") ||
			msg.includes("Request was aborted")
		) {
			return true;
		}
	}
	return false;
}

export interface AbortCheckerOptions {
	conversationId: string;
	abortSignal?: AbortSignal;
	abortController?: AbortController;
	promptedAt?: Date;
}

/**
 * Factory that returns a `() => boolean` closure combining:
 * - `AbortSignal` state
 * - `AbortedGenerations` DB polling
 * - Optional `AbortController` trigger (so downstream streams are cancelled)
 */
export function createAbortChecker(options: AbortCheckerOptions): () => boolean {
	const { conversationId, abortSignal, abortController, promptedAt } = options;
	return (): boolean => {
		if (abortSignal?.aborted) return true;
		const abortTime = AbortedGenerations.getInstance().getAbortTime(conversationId);
		if (abortTime && promptedAt && abortTime > promptedAt) {
			if (abortController && !abortController.signal.aborted) {
				abortController.abort();
			}
			return true;
		}
		return false;
	};
}
