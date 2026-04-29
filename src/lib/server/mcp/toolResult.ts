import { config } from "$lib/server/config";

const DEFAULT_MAX_TOOL_RESULT_CHARS = 8_000;

export function getMaxToolResultChars(): number {
	const envValue = config.MCP_MAX_TOOL_RESULT_CHARS;
	if (envValue) {
		const parsed = parseInt(envValue, 10);
		if (!isNaN(parsed) && parsed > 0) {
			return parsed;
		}
	}
	return DEFAULT_MAX_TOOL_RESULT_CHARS;
}

/**
 * Strip null bytes and excessive control characters that could poison the LLM context window.
 */
export function sanitizeToolResult(text: string): string {
	// Remove null bytes (side-channel padding defence)
	let cleaned = text.replace(/\0/g, "");
	// eslint-disable-next-line no-control-regex
	cleaned = cleaned.replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f-\x9f]+/g, " ");
	return cleaned;
}

/**
 * Truncate tool results so they don't blow the LLM context budget.
 * Appends a footer so the model knows data was cut.
 */
export function truncateToolResult(text: string, maxChars?: number): string {
	const limit = maxChars ?? getMaxToolResultChars();
	if (text.length <= limit) return text;
	const ellipsis = "\n\n… (truncated";
	const suffix = ` ${text.length - limit} chars omitted)`;
	const keep = limit - (ellipsis.length + suffix.length);
	if (keep <= 0) {
		return text.slice(0, limit);
	}
	return text.slice(0, keep) + ellipsis + suffix;
}

/**
 * Process raw tool output before sending it back to the LLM.
 * Applies sanitization + truncation.
 */
export function processToolOutput(text: string): { annotated: string; sources: [] } {
	const sanitized = sanitizeToolResult(text);
	const annotated = truncateToolResult(sanitized);
	return { annotated, sources: [] };
}
