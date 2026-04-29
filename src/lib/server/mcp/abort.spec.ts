import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isAbortError, createAbortChecker } from "./abort";

const getAbortTimeMock = vi.fn<() => Date | undefined>(() => undefined);
vi.mock("$lib/server/abortedGenerations", () => ({
	AbortedGenerations: {
		getInstance: () => ({
			getAbortTime: getAbortTimeMock,
		}),
	},
}));

describe("isAbortError", () => {
	it("returns true for AbortError by name", () => {
		const err = new Error("Request was aborted.");
		(err as Error).name = "AbortError";
		expect(isAbortError(err)).toBe(true);
	});

	it("returns true for APIUserAbortError by name", () => {
		const err = new Error("cancelled");
		(err as Error).name = "APIUserAbortError";
		expect(isAbortError(err)).toBe(true);
	});

	it("returns true for 'Request was aborted.' message", () => {
		expect(isAbortError(new Error("Request was aborted."))).toBe(true);
	});

	it("returns true for 'This operation was aborted' message", () => {
		expect(isAbortError(new Error("This operation was aborted"))).toBe(true);
	});

	it("returns true when message contains AbortError", () => {
		expect(isAbortError(new Error("something AbortError happened"))).toBe(true);
	});

	it("returns true when message contains APIUserAbortError", () => {
		expect(isAbortError(new Error("APIUserAbortError in stream"))).toBe(true);
	});

	it("returns false for generic errors", () => {
		expect(isAbortError(new Error("network timeout"))).toBe(false);
	});

	it("returns false for non-error values", () => {
		expect(isAbortError("string")).toBe(false);
		expect(isAbortError(null)).toBe(false);
		expect(isAbortError(undefined)).toBe(false);
		expect(isAbortError(42)).toBe(false);
	});
});

describe("createAbortChecker", () => {
	beforeEach(() => {
		getAbortTimeMock.mockReset();
		getAbortTimeMock.mockReturnValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns true when abortSignal is aborted", () => {
		const ctrl = new AbortController();
		ctrl.abort();
		const check = createAbortChecker({ conversationId: "c1", abortSignal: ctrl.signal });
		expect(check()).toBe(true);
	});

	it("returns false when nothing is aborted", () => {
		const check = createAbortChecker({ conversationId: "c1" });
		expect(check()).toBe(false);
	});

	it("returns true when DB abort time is after promptedAt", () => {
		const promptedAt = new Date("2024-01-01T00:00:00Z");
		const abortTime = new Date("2024-01-01T00:01:00Z");
		getAbortTimeMock.mockReturnValue(abortTime);
		const check = createAbortChecker({ conversationId: "c1", promptedAt });
		expect(check()).toBe(true);
	});

	it("returns false when DB abort time is before promptedAt", () => {
		const promptedAt = new Date("2024-01-01T00:01:00Z");
		const abortTime = new Date("2024-01-01T00:00:00Z");
		getAbortTimeMock.mockReturnValue(abortTime);
		const check = createAbortChecker({ conversationId: "c1", promptedAt });
		expect(check()).toBe(false);
	});

	it("triggers abortController when DB abort is newer", () => {
		const promptedAt = new Date("2024-01-01T00:00:00Z");
		const abortTime = new Date("2024-01-01T00:01:00Z");
		getAbortTimeMock.mockReturnValue(abortTime);
		const ctrl = new AbortController();
		const check = createAbortChecker({ conversationId: "c1", promptedAt, abortController: ctrl });
		expect(check()).toBe(true);
		expect(ctrl.signal.aborted).toBe(true);
	});

	it("does not re-abort an already aborted controller", () => {
		const promptedAt = new Date("2024-01-01T00:00:00Z");
		const abortTime = new Date("2024-01-01T00:01:00Z");
		getAbortTimeMock.mockReturnValue(abortTime);
		const ctrl = new AbortController();
		ctrl.abort();
		const check = createAbortChecker({ conversationId: "c1", promptedAt, abortController: ctrl });
		expect(check()).toBe(true);
		expect(ctrl.signal.aborted).toBe(true);
	});
});
