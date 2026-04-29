import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	sanitizeToolResult,
	truncateToolResult,
	processToolOutput,
	getMaxToolResultChars,
} from "./toolResult";
// eslint-disable-next-line no-var
var mcpMaxToolResultChars: string | undefined;

vi.mock("$lib/server/config", () => ({
	get config() {
		return {
			get MCP_MAX_TOOL_RESULT_CHARS() {
				return mcpMaxToolResultChars;
			},
		};
	},
}));

describe("sanitizeToolResult", () => {
	it("removes null bytes", () => {
		expect(sanitizeToolResult("a\0b\0c")).toBe("abc");
	});

	it("collapses excessive control characters to a space", () => {
		expect(sanitizeToolResult("hello\x01\x02world")).toBe("hello world");
	});

	it("preserves common whitespace", () => {
		expect(sanitizeToolResult("line1\nline2\tcol2")).toBe("line1\nline2\tcol2");
	});

	it("handles empty string", () => {
		expect(sanitizeToolResult("")).toBe("");
	});
});

describe("truncateToolResult", () => {
	it("returns short text unchanged", () => {
		const text = "short";
		expect(truncateToolResult(text, 100)).toBe(text);
	});

	it("truncates long text with a footer", () => {
		const text = "a".repeat(10_000);
		const result = truncateToolResult(text, 100);
		expect(result.length).toBeLessThanOrEqual(100);
		expect(result).toContain("… (truncated");
		expect(result).toContain("chars omitted)");
	});

	it("reports the correct number of omitted chars", () => {
		const text = "x".repeat(1_000);
		const result = truncateToolResult(text, 100);
		const match = result.match(/(\d+) chars omitted/);
		expect(match).toBeTruthy();
		expect(Number(match?.[1] ?? 0)).toBe(1_000 - 100);
	});

	it("falls back to default limit when maxChars omitted", () => {
		const text = "b".repeat(10_000);
		const result = truncateToolResult(text);
		expect(result.length).toBeLessThanOrEqual(8_000);
	});
});

describe("processToolOutput", () => {
	it("sanitizes and truncates", () => {
		const text = "a\0".repeat(5_000);
		const result = processToolOutput(text);
		expect(result.annotated).not.toContain("\0");
		expect(result.sources).toEqual([]);
	});
});

describe("getMaxToolResultChars", () => {
	beforeEach(() => {
		mcpMaxToolResultChars = undefined;
	});

	it("reads from config.MCP_MAX_TOOL_RESULT_CHARS", () => {
		mcpMaxToolResultChars = "5000";
	});

	it("falls back to 8000 when config is missing", () => {
		expect(getMaxToolResultChars()).toBe(8_000);
	});

	it("falls back to 8000 for invalid config values", () => {
		mcpMaxToolResultChars = "not-a-number";
	});
});
