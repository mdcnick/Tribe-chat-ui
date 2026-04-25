import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const getMcpServersMock = vi.fn(() => [{ name: "Test MCP", url: "https://example.com/mcp" }]);
const isValidUrlMock = vi.fn(() => true);
const canUseHermesToolsMock = vi.fn(async () => true);
const resetMcpToolsCacheMock = vi.fn();
const getOpenAiToolsForMcpMock = vi.fn();
const resolveRouterTargetMock = vi.fn();
const executeToolCallsMock = vi.fn();
const drainPoolMock = vi.fn(async () => {});
const getAbortTimeMock = vi.fn(() => undefined);
const shouldOpenBrowserPanelMock = vi.fn((toolName: string) => toolName.includes("search"));
const browserSessionStoreGetMock = vi.fn();
const browserSessionStoreGetOrCreateMock = vi.fn();
const browserSessionStoreNavigateMock = vi.fn();
const loggerDebugMock = vi.fn();
const loggerInfoMock = vi.fn();
const loggerWarnMock = vi.fn();
const prepareMessagesWithFilesMock = vi.fn();
const makeImageProcessorMock = vi.fn(() => ({ process: vi.fn() }));
const buildImageRefResolverMock = vi.fn(() => vi.fn());

vi.mock("$lib/server/mcp/registry", () => ({
	getMcpServers: getMcpServersMock,
}));

vi.mock("$lib/server/urlSafety", () => ({
	isValidUrl: isValidUrlMock,
}));

vi.mock("$lib/server/billing/entitlements", () => ({
	canUseHermesTools: canUseHermesToolsMock,
}));

vi.mock("$lib/server/mcp/tools", () => ({
	resetMcpToolsCache: resetMcpToolsCacheMock,
	getOpenAiToolsForMcp: getOpenAiToolsForMcpMock,
}));

vi.mock("./routerResolution", () => ({
	resolveRouterTarget: resolveRouterTargetMock,
}));

vi.mock("./toolInvocation", () => ({
	executeToolCalls: executeToolCallsMock,
}));

vi.mock("$lib/server/mcp/clientPool", () => ({
	drainPool: drainPoolMock,
}));

vi.mock("$lib/server/abortedGenerations", () => ({
	AbortedGenerations: {
		getInstance: () => ({
			getAbortTime: getAbortTimeMock,
		}),
	},
}));

vi.mock("$lib/server/browser/steel", () => ({
	shouldOpenBrowserPanel: shouldOpenBrowserPanelMock,
}));

vi.mock("$lib/server/browser/sessionStore", () => ({
	browserSessionStore: {
		get: browserSessionStoreGetMock,
		getOrCreate: browserSessionStoreGetOrCreateMock,
		navigate: browserSessionStoreNavigateMock,
	},
}));

vi.mock("$lib/server/logger", () => ({
	logger: {
		debug: loggerDebugMock,
		info: loggerInfoMock,
		warn: loggerWarnMock,
	},
}));

vi.mock("$lib/server/textGeneration/utils/prepareFiles", () => ({
	prepareMessagesWithFiles: prepareMessagesWithFilesMock,
}));

vi.mock("$lib/server/endpoints/images", () => ({
	makeImageProcessor: makeImageProcessorMock,
}));

vi.mock("./fileRefs", () => ({
	buildImageRefResolver: buildImageRefResolverMock,
}));

vi.mock("$lib/server/config", () => ({
	config: {
		OPENAI_API_KEY: "test-key",
		HF_TOKEN: "",
		OPENAI_BASE_URL: "https://openai.example/v1",
		MCP_FORWARD_HF_USER_TOKEN: "false",
		EXA_API_KEY: "",
		isHuggingChat: false,
	},
}));

class FakeStream<T> implements AsyncIterable<T> {
	constructor(private readonly values: T[]) {}

	async *[Symbol.asyncIterator](): AsyncIterator<T> {
		for (const value of this.values) {
			yield value;
		}
	}
}

const createMock = vi.fn();

vi.mock("openai", () => ({
	OpenAI: class {
		chat = {
			completions: {
				create: createMock,
			},
		};
	},
}));

function toolCallChunk({
	id,
	name,
	argumentsJson,
}: {
	id: string;
	name: string;
	argumentsJson: string;
}) {
	return {
		choices: [
			{
				delta: {
					tool_calls: [
						{
							index: 0,
							id,
							function: {
								name,
								arguments: argumentsJson,
							},
						},
					],
				},
			},
		],
	};
}

function finalAnswerChunk(text: string) {
	return {
		choices: [
			{
				delta: {
					content: text,
				},
			},
		],
	};
}

async function collectUpdates(generator: AsyncGenerator<unknown, unknown, undefined>) {
	const updates: unknown[] = [];
	let result = await generator.next();
	while (!result.done) {
		updates.push(result.value);
		result = await generator.next();
	}
	return { updates, result: result.value };
}

describe("runMcpFlow", () => {
	beforeEach(() => {
		vi.resetModules();
		getMcpServersMock.mockClear();
		isValidUrlMock.mockClear();
		canUseHermesToolsMock.mockClear();
		resetMcpToolsCacheMock.mockClear();
		getOpenAiToolsForMcpMock.mockReset();
		resolveRouterTargetMock.mockReset();
		executeToolCallsMock.mockReset();
		drainPoolMock.mockClear();
		getAbortTimeMock.mockReset();
		getAbortTimeMock.mockReturnValue(undefined);
		shouldOpenBrowserPanelMock.mockClear();
		browserSessionStoreGetMock.mockReset();
		browserSessionStoreGetOrCreateMock.mockReset();
		browserSessionStoreNavigateMock.mockReset();
		loggerDebugMock.mockReset();
		loggerInfoMock.mockReset();
		loggerWarnMock.mockReset();
		prepareMessagesWithFilesMock.mockReset();
		makeImageProcessorMock.mockClear();
		buildImageRefResolverMock.mockClear();
		createMock.mockReset();

		getOpenAiToolsForMcpMock.mockResolvedValue({
			tools: [
				{
					type: "function",
					function: {
						name: "web_search",
						description: "Search the web",
						parameters: { type: "object", properties: {} },
					},
				},
			],
			mapping: {},
		});
		prepareMessagesWithFilesMock.mockImplementation(async (messages: unknown[]) => messages as never);
		resolveRouterTargetMock.mockResolvedValue({
			runMcp: true,
			targetModel: {
				id: "router-model",
				name: "router-model",
				parameters: {},
				multimodal: false,
				supportsTools: true,
			},
			candidateModelId: undefined,
			resolvedRoute: undefined,
		});
		executeToolCallsMock.mockImplementation(async function* () {
			yield {
				type: "result",
				summary: {
					toolMessages: [
						{
							role: "tool",
							content: "tool result",
							tool_call_id: "call-1",
						},
					],
					toolRuns: [{ name: "web_search" }],
				},
			};
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("throws 402 when MCP servers are active and user is not entitled", async () => {
		canUseHermesToolsMock.mockResolvedValueOnce(false);
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

	it("opens a browser session on the first matching tool call and keeps the live debugUrl", async () => {
		const conversationId = new ObjectId();
		browserSessionStoreGetMock.mockReturnValueOnce(undefined);
		browserSessionStoreGetOrCreateMock.mockResolvedValueOnce({
			sessionId: "steel-session-1",
			debugUrl: "https://steel.example/live/session-1",
			conversationId: conversationId.toString(),
			lastUsedAt: 1,
		});
		createMock
			.mockResolvedValueOnce(
				new FakeStream([
					toolCallChunk({
						id: "call-1",
						name: "web_search",
						argumentsJson: JSON.stringify({ query: "weather" }),
					}),
				])
			)
			.mockResolvedValueOnce(new FakeStream([finalAnswerChunk("Here is the weather.")]));

		const { runMcpFlow } = await import("./runMcpFlow");
		const { updates, result } = await collectUpdates(
			runMcpFlow({
				model: {
					id: "router-model",
					name: "router-model",
					parameters: {},
					multimodal: false,
					supportsTools: true,
				} as never,
				conv: {
					_id: conversationId,
				} as never,
				messages: [
					{
						from: "user",
						content: "Find the weather",
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
				abortController: new AbortController(),
				promptedAt: new Date(),
			})
		);

		expect(result).toBe("completed");
		expect(browserSessionStoreGetMock).toHaveBeenCalledWith(conversationId.toString());
		expect(browserSessionStoreGetOrCreateMock).toHaveBeenCalledWith(conversationId.toString(), {
			query: "weather",
			url: undefined,
		});
		expect(browserSessionStoreNavigateMock).not.toHaveBeenCalled();
		expect(updates).toContainEqual({
			type: "browser",
			status: "open",
			sessionId: "steel-session-1",
			debugUrl: "https://steel.example/live/session-1",
			url: "https://www.google.com/search?q=weather",
		});
		expect(updates).not.toContainEqual(
			expect.objectContaining({
				type: "browser",
				status: "close",
			})
		);
		expect(updates.at(-1)).toEqual({
			type: "finalAnswer",
			text: "Here is the weather.",
			interrupted: false,
		});
		expect(drainPoolMock).toHaveBeenCalledTimes(1);
	});

	it("emits a browser error update when the panel should open but session creation fails", async () => {
		const conversationId = new ObjectId();
		browserSessionStoreGetMock.mockReturnValueOnce(undefined);
		browserSessionStoreGetOrCreateMock.mockResolvedValueOnce(null);
		createMock
			.mockResolvedValueOnce(
				new FakeStream([
					toolCallChunk({
						id: "call-1",
						name: "web_search",
						argumentsJson: JSON.stringify({ query: "weather" }),
					}),
				])
			)
			.mockResolvedValueOnce(new FakeStream([finalAnswerChunk("Here is the weather.")]));

		const { runMcpFlow } = await import("./runMcpFlow");
		const { updates, result } = await collectUpdates(
			runMcpFlow({
				model: {
					id: "router-model",
					name: "router-model",
					parameters: {},
					multimodal: false,
					supportsTools: true,
				} as never,
				conv: {
					_id: conversationId,
				} as never,
				messages: [
					{
						from: "user",
						content: "Find the weather",
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
				abortController: new AbortController(),
				promptedAt: new Date(),
			})
		);

		expect(result).toBe("completed");
		expect(browserSessionStoreGetMock).toHaveBeenCalledWith(conversationId.toString());
		expect(browserSessionStoreGetOrCreateMock).toHaveBeenCalledWith(conversationId.toString(), {
			query: "weather",
			url: undefined,
		});
		expect(updates).toContainEqual({
			type: "browser",
			status: "error",
			url: "https://www.google.com/search?q=weather",
			message: "Couldn’t open the browser panel. Try again.",
		});
		expect(updates).not.toContainEqual(
			expect.objectContaining({
				type: "browser",
				status: "open",
			})
		);
		expect(loggerWarnMock).toHaveBeenCalledWith(
			{
				conversationId: conversationId.toString(),
				toolName: "web_search",
				hasQuery: true,
				hasUrl: false,
			},
			"[mcp] failed to create browser session for panel open"
		);
	});

	it("reuses the existing browser session and emits navigate for follow-up tool calls", async () => {
		const conversationId = new ObjectId();
		browserSessionStoreGetMock.mockReturnValueOnce({
			sessionId: "steel-session-1",
			debugUrl: "https://steel.example/live/session-1",
			conversationId: conversationId.toString(),
			lastUsedAt: 1,
		});
		browserSessionStoreNavigateMock.mockResolvedValueOnce({
			sessionId: "steel-session-1",
			debugUrl: "https://steel.example/live/session-1",
			conversationId: conversationId.toString(),
			lastUsedAt: 2,
		});
		createMock
			.mockResolvedValueOnce(
				new FakeStream([
					toolCallChunk({
						id: "call-2",
						name: "web_search",
						argumentsJson: JSON.stringify({ url: "https://example.com/article" }),
					}),
				])
			)
			.mockResolvedValueOnce(new FakeStream([finalAnswerChunk("Opened the article.")]));

		const { runMcpFlow } = await import("./runMcpFlow");
		const { updates, result } = await collectUpdates(
			runMcpFlow({
				model: {
					id: "router-model",
					name: "router-model",
					parameters: {},
					multimodal: false,
					supportsTools: true,
				} as never,
				conv: {
					_id: conversationId,
				} as never,
				messages: [
					{
						from: "user",
						content: "Open the article",
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
				abortController: new AbortController(),
				promptedAt: new Date(),
			})
		);

		expect(result).toBe("completed");
		expect(browserSessionStoreGetMock).toHaveBeenCalledWith(conversationId.toString());
		expect(browserSessionStoreNavigateMock).toHaveBeenCalledWith(conversationId.toString(), {
			query: undefined,
			url: "https://example.com/article",
		});
		expect(browserSessionStoreGetOrCreateMock).not.toHaveBeenCalled();
		expect(updates).toContainEqual({
			type: "browser",
			status: "navigate",
			sessionId: "steel-session-1",
			debugUrl: "https://steel.example/live/session-1",
			url: "https://example.com/article",
		});
		expect(updates).not.toContainEqual(
			expect.objectContaining({
				type: "browser",
				status: "open",
			})
		);
		expect(updates).not.toContainEqual(
			expect.objectContaining({
				type: "browser",
				status: "close",
			})
		);
	});
});
