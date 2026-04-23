import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

vi.mock("$lib/server/mcp/registry", () => ({
	getMcpServers: () => [{ name: "Test MCP", url: "https://example.com/mcp" }],
}));

vi.mock("$lib/server/urlSafety", () => ({
	isValidUrl: () => true,
}));

vi.mock("$lib/server/billing/entitlements", async () => {
	const actual = await vi.importActual<typeof import("$lib/server/billing/entitlements")>(
		"$lib/server/billing/entitlements"
	);
	return {
		...actual,
		canUseHermesTools: async () => false,
	};
});

describe("runMcpFlow paywall gating", () => {
	it("throws 402 when MCP servers are active and user is not entitled", async () => {
		const { runMcpFlow } = await import("./runMcpFlow");

		const gen = runMcpFlow({
			model: {
				id: "router-model",
				name: "router-model",
				parameters: {},
				multimodal: false,
				supportsTools: true,
			} as never,
			conv: {
				_id: new ObjectId(),
			} as never,
			messages: [
				{
					from: "user",
					content: "hello",
				},
			] as never,
			assistant: undefined,
			forceMultimodal: false,
			forceTools: true,
			provider: undefined,
			locals: {
				sessionId: "test-session",
				isAdmin: false,
			} as never,
		});

		await expect(gen.next()).rejects.toMatchObject({ statusCode: 402 });
	});
});
