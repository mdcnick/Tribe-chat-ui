import { describe, expect, it } from "vitest";
import {
	applyBrowserPanelUpdate,
	applyBrowserUpdateState,
	type BrowserPanelState,
} from "./browserPanelState";
import {
	MessageUpdateStatus,
	MessageUpdateType,
	type MessageBrowserUpdate,
} from "$lib/types/MessageUpdate";

function browserUpdate(
	update: Omit<MessageBrowserUpdate, "type">
): MessageBrowserUpdate {
	return {
		type: MessageUpdateType.Browser,
		...update,
	};
}

describe("browserPanelState", () => {
	it("keeps the live debugUrl stable across navigate updates", () => {
		const initial: BrowserPanelState = {
			debugUrl: "https://steel.example/live/session-1",
			url: "https://www.google.com/search?q=weather",
		};

		const next = applyBrowserUpdateState(
			initial,
			browserUpdate({
				status: "navigate",
				sessionId: "steel-session-1",
				debugUrl: "https://steel.example/live/session-1",
				url: "https://example.com/result",
			})
		);

		expect(next).toEqual({
			debugUrl: "https://steel.example/live/session-1",
			url: "https://example.com/result",
		});
	});

	it("preserves the panel across unrelated updates and clears on close", () => {
		const openState = applyBrowserPanelUpdate(
			{},
			browserUpdate({
				status: "open",
				sessionId: "steel-session-2",
				debugUrl: "https://steel.example/live/session-2",
				url: "https://www.google.com/search?q=chat-ui",
			})
		);

		const afterNonBrowser = applyBrowserPanelUpdate(openState, {
			type: MessageUpdateType.Status,
			status: MessageUpdateStatus.Started,
		});
		const afterClose = applyBrowserPanelUpdate(
			afterNonBrowser,
			browserUpdate({
				status: "close",
				sessionId: "steel-session-2",
				debugUrl: "https://steel.example/live/session-2",
			})
		);

		expect(afterNonBrowser).toEqual(openState);
		expect(afterClose).toEqual({ debugUrl: undefined, url: undefined });
	});
});
