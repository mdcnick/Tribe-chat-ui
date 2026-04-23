import { describe, expect, it, vi } from "vitest";

describe("tools route model resolution", () => {
	it("prefers LLM_ROUTER_HERMES_MODEL when tools are active", async () => {
		vi.resetModules();
		vi.doMock("$lib/server/config", () => ({
			config: {
				LLM_ROUTER_HERMES_MODEL: "hermes-model",
				LLM_ROUTER_TOOLS_MODEL: "legacy-model",
				LLM_ROUTER_ENABLE_TOOLS: "true",
			},
		}));
		vi.doMock("$lib/server/logger", () => ({
			logger: {
				warn: vi.fn(),
				info: vi.fn(),
			},
		}));

		const { pickToolsCapableModel } = await import("./toolsRoute");
		const picked = pickToolsCapableModel([
			{ id: "legacy-model", name: "legacy-model" },
			{ id: "hermes-model", name: "hermes-model" },
		] as never);

		expect(picked?.id).toBe("hermes-model");
	});

	it("falls back to LLM_ROUTER_TOOLS_MODEL when hermes key is unset", async () => {
		vi.resetModules();
		vi.doMock("$lib/server/config", () => ({
			config: {
				LLM_ROUTER_HERMES_MODEL: "",
				LLM_ROUTER_TOOLS_MODEL: "legacy-model",
				LLM_ROUTER_ENABLE_TOOLS: "true",
			},
		}));
		vi.doMock("$lib/server/logger", () => ({
			logger: {
				warn: vi.fn(),
				info: vi.fn(),
			},
		}));

		const { pickToolsCapableModel } = await import("./toolsRoute");
		const picked = pickToolsCapableModel([{ id: "legacy-model", name: "legacy-model" }] as never);

		expect(picked?.id).toBe("legacy-model");
	});
});
