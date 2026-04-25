import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserSession } from "$lib/server/browser/steel";

const loggerDebug = vi.fn();

vi.mock("$lib/server/logger", () => ({
	logger: {
		debug: loggerDebug,
	},
}));

describe("BrowserSessionStore", () => {
	beforeEach(() => {
		vi.resetModules();
		loggerDebug.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("reuses the same session for repeated getOrCreate calls in one conversation", async () => {
		const createSession = vi.fn<
			(query?: string, url?: string) => Promise<BrowserSession | null>
		>().mockResolvedValue({
			sessionId: "steel-session-1",
			debugUrl: "https://debug.example/session/1",
		});
		const releaseSession = vi.fn<(sessionId: string) => Promise<void>>().mockResolvedValue();
		const navigateSession = vi
			.fn<(sessionId: string, query?: string, url?: string) => Promise<void>>()
			.mockResolvedValue();
		const { BrowserSessionStore } = await import("./sessionStore");
		const store = new BrowserSessionStore({
			dependencies: {
				createSession,
				releaseSession,
				navigateSession,
				now: () => 1_000,
			},
		});

		const first = await store.getOrCreate("conv-1", { query: "weather" });
		const second = await store.getOrCreate("conv-1", { query: "ignored" });

		expect(first).toEqual(second);
		expect(first?.sessionId).toBe("steel-session-1");
		expect(createSession).toHaveBeenCalledTimes(1);
		expect(createSession).toHaveBeenCalledWith("weather", undefined);
		expect(releaseSession).not.toHaveBeenCalled();
		expect(store.size()).toBe(1);
		expect(loggerDebug).toHaveBeenCalledWith(
			{ conversationId: "conv-1", sessionId: "steel-session-1" },
			"[steel] created browser session in conversation store"
		);
		expect(loggerDebug).toHaveBeenCalledWith(
			{ conversationId: "conv-1", sessionId: "steel-session-1" },
			"[steel] reusing browser session from conversation store"
		);
	});

	it("navigates an existing session without creating a new one", async () => {
		let now = 1_000;
		const createSession = vi.fn<
			(query?: string, url?: string) => Promise<BrowserSession | null>
		>().mockResolvedValue({
			sessionId: "steel-session-2",
			debugUrl: "https://debug.example/session/2",
		});
		const releaseSession = vi.fn<(sessionId: string) => Promise<void>>().mockResolvedValue();
		const navigateSession = vi
			.fn<(sessionId: string, query?: string, url?: string) => Promise<void>>()
			.mockResolvedValue();
		const { BrowserSessionStore } = await import("./sessionStore");
		const store = new BrowserSessionStore({
			dependencies: {
				createSession,
				releaseSession,
				navigateSession,
				now: () => now,
			},
		});

		const created = await store.getOrCreate("conv-2", { url: "https://example.com" });
		now = 2_500;
		const navigated = await store.navigate("conv-2", { query: "steel browser" });

		expect(navigated?.sessionId).toBe(created?.sessionId);
		expect(createSession).toHaveBeenCalledTimes(1);
		expect(navigateSession).toHaveBeenCalledTimes(1);
		expect(navigateSession).toHaveBeenCalledWith(
			"steel-session-2",
			"steel browser",
			undefined
		);
		expect(store.get("conv-2")?.lastUsedAt).toBe(2_500);
		expect(loggerDebug).toHaveBeenCalledWith(
			{ conversationId: "conv-2", sessionId: "steel-session-2" },
			"[steel] navigated existing browser session from conversation store"
		);
	});

	it("releases a stored session once and allows a fresh session afterward", async () => {
		let createdCount = 0;
		const createSession = vi.fn<
			(query?: string, url?: string) => Promise<BrowserSession | null>
		>().mockImplementation(async () => {
			createdCount += 1;
			return {
				sessionId: `steel-session-${createdCount}`,
				debugUrl: `https://debug.example/session/${createdCount}`,
			};
		});
		const releaseSession = vi.fn<(sessionId: string) => Promise<void>>().mockResolvedValue();
		const navigateSession = vi
			.fn<(sessionId: string, query?: string, url?: string) => Promise<void>>()
			.mockResolvedValue();
		const { BrowserSessionStore } = await import("./sessionStore");
		const store = new BrowserSessionStore({
			dependencies: {
				createSession,
				releaseSession,
				navigateSession,
				now: () => 1_000,
			},
		});

		const first = await store.getOrCreate("conv-release", { url: "https://example.com" });
		const released = await store.release("conv-release", "manual-close");
		const second = await store.getOrCreate("conv-release", { query: "fresh session" });

		expect(released).toBe(true);
		expect(store.size()).toBe(1);
		expect(store.get("conv-release")?.sessionId).toBe("steel-session-2");
		expect(first?.sessionId).toBe("steel-session-1");
		expect(second?.sessionId).toBe("steel-session-2");
		expect(second).not.toEqual(first);
		expect(releaseSession).toHaveBeenCalledTimes(1);
		expect(releaseSession).toHaveBeenCalledWith("steel-session-1");
		expect(createSession).toHaveBeenCalledTimes(2);
		expect(loggerDebug).toHaveBeenCalledWith(
			{
				conversationId: "conv-release",
				sessionId: "steel-session-1",
				reason: "manual-close",
			},
			"[steel] released browser session from conversation store"
		);
	});

	it("returns false when release is requested without a stored session", async () => {
		const createSession = vi.fn<
			(query?: string, url?: string) => Promise<BrowserSession | null>
		>();
		const releaseSession = vi.fn<(sessionId: string) => Promise<void>>().mockResolvedValue();
		const navigateSession = vi
			.fn<(sessionId: string, query?: string, url?: string) => Promise<void>>()
			.mockResolvedValue();
		const { BrowserSessionStore } = await import("./sessionStore");
		const store = new BrowserSessionStore({
			dependencies: {
				createSession,
				releaseSession,
				navigateSession,
				now: () => 1_000,
			},
		});

		const released = await store.release("missing-conversation", "manual-close");

		expect(released).toBe(false);
		expect(releaseSession).not.toHaveBeenCalled();
		expect(loggerDebug).not.toHaveBeenCalledWith(
			expect.objectContaining({ conversationId: "missing-conversation" }),
			expect.stringContaining("released browser session")
		);
	});

	it("releases idle sessions through cleanupExpired", async () => {
		let now = 0;
		let createdCount = 0;
		const createSession = vi.fn<
			(query?: string, url?: string) => Promise<BrowserSession | null>
		>().mockImplementation(async () => {
			createdCount += 1;
			return {
				sessionId: `steel-session-${createdCount}`,
				debugUrl: `https://debug.example/session/${createdCount}`,
			};
		});
		const releaseSession = vi.fn<(sessionId: string) => Promise<void>>().mockResolvedValue();
		const navigateSession = vi
			.fn<(sessionId: string, query?: string, url?: string) => Promise<void>>()
			.mockResolvedValue();
		const { BrowserSessionStore } = await import("./sessionStore");
		const store = new BrowserSessionStore({
			idleTimeoutMs: 100,
			dependencies: {
				createSession,
				releaseSession,
				navigateSession,
				now: () => now,
			},
		});

		await store.getOrCreate("conv-a");
		now = 50;
		await store.getOrCreate("conv-b");
		now = 120;
		const released = await store.cleanupExpired();

		expect(released).toEqual(["conv-a"]);
		expect(releaseSession).toHaveBeenCalledTimes(1);
		expect(releaseSession).toHaveBeenCalledWith("steel-session-1");
		expect(store.get("conv-a")).toBeUndefined();
		expect(store.get("conv-b")?.sessionId).toBe("steel-session-2");
		expect(loggerDebug).toHaveBeenCalledWith(
			{
				conversationId: "conv-a",
				sessionId: "steel-session-1",
				idleTimeoutMs: 100,
			},
			"[steel] released idle browser session from conversation store"
		);
	});
});
