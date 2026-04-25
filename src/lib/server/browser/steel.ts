import Steel from "steel-sdk";
import { chromium } from "playwright-core";
import { env } from "$env/dynamic/private";
import { logger } from "$lib/server/logger";

let client: Steel | null = null;

function getClient(): Steel | null {
	if (client) return client;
	const apiKey = env.STEEL_API_KEY;
	if (!apiKey) return null;
	client = new Steel({
		steelAPIKey: apiKey,
		baseURL: env.STEEL_BASE_URL || undefined,
	});
	return client;
}

export interface BrowserSession {
	sessionId: string;
	debugUrl: string;
}

export async function createBrowserSession(
	query?: string,
	url?: string
): Promise<BrowserSession | null> {
	const steel = getClient();
	if (!steel) {
		logger.debug("[steel] STEEL_API_KEY not set, skipping browser session");
		return null;
	}

	try {
		const session = await steel.sessions.create({
			timeout: 120_000,
		});

		logger.debug({ sessionId: session.id, debugUrl: session.debugUrl }, "[steel] session created");

		// If we have a query or URL, navigate the browser using Playwright
		if (query || url) {
			try {
				const browser = await chromium.connectOverCDP(session.websocketUrl);
				const context = browser.contexts()[0] ?? (await browser.newContext());
				const page = context.pages()[0] ?? (await context.newPage());

				const targetUrl =
					url ?? `https://www.google.com/search?q=${encodeURIComponent(query ?? "")}`;
				await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });

				// Detach Playwright but leave the session alive for the iframe
				await browser.close();
			} catch (navErr) {
				logger.warn(
					{ sessionId: session.id, error: navErr instanceof Error ? navErr.message : navErr },
					"[steel] failed to navigate browser, returning session anyway"
				);
			}
		}

		return { sessionId: session.id, debugUrl: session.debugUrl };
	} catch (err) {
		logger.warn(
			{ error: err instanceof Error ? err.message : err },
			"[steel] failed to create browser session"
		);
		return null;
	}
}

export async function releaseBrowserSession(sessionId: string): Promise<void> {
	const steel = getClient();
	if (!steel) return;

	try {
		await steel.sessions.release(sessionId);
		logger.debug({ sessionId }, "[steel] session released");
	} catch (err) {
		logger.warn(
			{ sessionId, error: err instanceof Error ? err.message : err },
			"[steel] failed to release session"
		);
	}
}

export function shouldOpenBrowserPanel(toolName: string): boolean {
	const patterns = (env.STEEL_BROWSER_TOOL_PATTERNS ?? "")
		.split(",")
		.map((p) => p.trim().toLowerCase())
		.filter(Boolean);
	if (!patterns.length) return false;
	const normalized = toolName.toLowerCase();
	return patterns.some((p) => normalized.includes(p));
}
