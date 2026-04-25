import BrowserPanel from "./BrowserPanel.svelte";
import { render } from "vitest-browser-svelte";
import { page } from "@vitest/browser/context";
import { describe, expect, it, vi } from "vitest";

describe("BrowserPanel", () => {
	it("renders the live iframe path and loading state before the stream loads", () => {
		const { baseElement } = render(BrowserPanel, {
			debugUrl: "https://steel.example/live/session-1",
			url: "https://example.com",
			onClose: vi.fn(),
		});

		expect(page.getByText("Loading browser…")).toBeInTheDocument();
		expect(page.getByTitle("Live Browser")).toBeInTheDocument();
		expect(page.getByLabelText("Reload browser")).toBeInTheDocument();
		expect(page.getByLabelText("Close browser panel")).toBeInTheDocument();

		const iframe = baseElement.querySelector("iframe");
		expect(iframe).not.toBeNull();
		expect(iframe?.getAttribute("src")).toContain("showControls=true");
	});

	it("renders a server-emitted browser error without a retry button when no session exists", () => {
		render(BrowserPanel, {
			error: "Couldn't open the browser panel. Try again.",
			url: "https://www.google.com/search?q=chat-ui",
			onClose: vi.fn(),
		});

		expect(page.getByText("Browser unavailable")).toBeInTheDocument();
		expect(page.getByText("Couldn't open the browser panel. Try again.")).toBeInTheDocument();
		expect(page.getByRole("button", { name: "Close panel" })).toBeInTheDocument();
		expect(page.getByRole("button", { name: "Retry" }).elements).toHaveLength(0);
		expect(page.getByLabelText("Reload browser").elements).toHaveLength(0);
	});

	it("shows fallback UI with retry and close affordances when an error occurs alongside an active session", () => {
		const onClose = vi.fn();
		render(BrowserPanel, {
			debugUrl: "https://steel.example/live/session-2",
			url: "https://example.com/article",
			error: "Couldn't load the live browser. Try reloading or close the panel.",
			onClose,
		});

		expect(
			page.getByText("Couldn't load the live browser. Try reloading or close the panel.")
		).toBeInTheDocument();
		expect(page.getByRole("button", { name: "Retry" })).toBeInTheDocument();
		expect(page.getByRole("button", { name: "Close panel" })).toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});
});
