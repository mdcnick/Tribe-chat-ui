import Steel from "steel-sdk";
import { chromium, type Browser } from "playwright-core";
import { env } from "$env/dynamic/private";
import { logger } from "$lib/server/logger";

let client: Steel | null = null;

const DEFAULT_STEEL_SESSION_TIMEOUT_MS = 120_000;
const DEFAULT_STEEL_NAVIGATION_TIMEOUT_MS = 15_000;

function getClient(): Steel | null {
	if (client) return client;
	const apiKey = env.STEEL_API_KEY;
	const baseURL = env.STEEL_BASE_URL;
	// Require API key for Steel cloud (no custom baseURL).
	// Self-hosted instances (e.g. Railway) often don't require auth by default.
	if (!apiKey && !baseURL) return null;
	client = new Steel({
		...(apiKey ? { steelAPIKey: apiKey } : {}),
		...(baseURL ? { baseURL } : {}),
	});
	return client;
}

export function rewriteDebugUrl(original: string): string {
	const publicPrefix = env.STEEL_PUBLIC_DEBUG_URL;
	if (!publicPrefix) return original;
	try {
		const url = new URL(original);
		const prefix = new URL(publicPrefix);
		url.protocol = prefix.protocol;
		url.hostname = prefix.hostname;
		url.port = prefix.port;
		return url.toString();
	} catch {
		return original;
	}
}

export interface BrowserSession {
	sessionId: string;
	debugUrl: string;
}

export async function createSteelSession(options?: {
	timeoutMs?: number;
}): Promise<{ sessionId: string; debugUrl: string; websocketUrl: string } | null> {
	const steel = getClient();
	if (!steel) {
		logger.debug("[steel] STEEL not configured (set STEEL_API_KEY or STEEL_BASE_URL)");
		return null;
	}

	try {
		const session = await steel.sessions.create({
			timeout: options?.timeoutMs ?? DEFAULT_STEEL_SESSION_TIMEOUT_MS,
		});

		const debugUrl = rewriteDebugUrl(session.debugUrl);
		logger.debug({ sessionId: session.id, debugUrl }, "[steel] session created");
		return {
			sessionId: session.id,
			debugUrl,
			websocketUrl: session.websocketUrl,
		};
	} catch (err) {
		logger.warn(
			{ error: err instanceof Error ? err.message : err },
			"[steel] failed to create browser session"
		);
		return null;
	}
}

export async function connectToSteelSession(websocketUrl: string): Promise<Browser> {
	return chromium.connectOverCDP(websocketUrl);
}

function getNavigationTarget(query?: string, url?: string): string {
	return url ?? `https://www.google.com/search?q=${encodeURIComponent(query ?? "")}`;
}

export async function navigateBrowserWithConnection(
	browser: Browser,
	target: { query?: string; url?: string },
	options?: { timeoutMs?: number }
): Promise<void> {
	const context = browser.contexts()[0] ?? (await browser.newContext());
	const page = context.pages()[0] ?? (await context.newPage());
	await page.goto(getNavigationTarget(target.query, target.url), {
		waitUntil: "domcontentloaded",
		timeout: options?.timeoutMs ?? DEFAULT_STEEL_NAVIGATION_TIMEOUT_MS,
	});
}

export async function navigateBrowserSession(
	websocketOrSessionId: string,
	query?: string,
	url?: string,
	options?: { timeoutMs?: number; websocketUrl?: string }
): Promise<void> {
	const websocketUrl = options?.websocketUrl ?? websocketOrSessionId;
	const browser = await connectToSteelSession(websocketUrl);
	try {
		await navigateBrowserWithConnection(browser, { query, url }, options);
	} finally {
		// Detach Playwright but leave the Steel session alive for the iframe.
		await browser.close();
	}
}

export async function createBrowserSession(
	query?: string,
	url?: string,
	options?: { sessionTimeoutMs?: number; navigationTimeoutMs?: number }
): Promise<BrowserSession | null> {
	const session = await createSteelSession({ timeoutMs: options?.sessionTimeoutMs });
	if (!session) return null;

	if (query || url) {
		try {
			await navigateBrowserSession(session.websocketUrl, query, url, {
				timeoutMs: options?.navigationTimeoutMs,
			});
		} catch (navErr) {
			logger.warn(
				{ sessionId: session.sessionId, error: navErr instanceof Error ? navErr.message : navErr },
				"[steel] failed to navigate browser, returning session anyway"
			);
		}
	}

	return { sessionId: session.sessionId, debugUrl: session.debugUrl };
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
