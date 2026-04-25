import { MessageUpdateType, type MessageBrowserUpdate, type MessageUpdate } from "$lib/types/MessageUpdate";

export interface BrowserPanelState {
	debugUrl?: string;
	url?: string;
}

/**
 * Keep the client iframe attached to Steel's live debugUrl across tool-driven navigations.
 * The server reuses the same browser session per conversation and only updates the visible URL.
 */
export function applyBrowserPanelUpdate(
	state: BrowserPanelState,
	update: MessageUpdate
): BrowserPanelState {
	if (update.type !== MessageUpdateType.Browser) {
		return state;
	}

	return applyBrowserUpdateState(state, update);
}

export function applyBrowserUpdateState(
	state: BrowserPanelState,
	update: MessageBrowserUpdate
): BrowserPanelState {
	if (update.status === "open") {
		return {
			debugUrl: update.debugUrl,
			url: update.url,
		};
	}

	if (update.status === "navigate") {
		return {
			debugUrl: state.debugUrl ?? update.debugUrl,
			url: update.url,
		};
	}

	return {
		debugUrl: undefined,
		url: undefined,
	};
}
