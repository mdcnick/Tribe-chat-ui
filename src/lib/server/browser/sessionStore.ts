import { logger } from "$lib/server/logger";
import type { BrowserSession } from "$lib/server/browser/steel";
import {
	createBrowserSession,
	releaseBrowserSession,
	navigateBrowserSession,
} from "$lib/server/browser/steel";

export interface SessionStoreEntry extends BrowserSession {
	conversationId: string;
	lastUsedAt: number;
}

export interface SessionStoreDependencies {
	createSession: typeof createBrowserSession;
	releaseSession: typeof releaseBrowserSession;
	navigateSession: typeof navigateBrowserSession;
	now: () => number;
}

export interface SessionStoreOptions {
	idleTimeoutMs?: number;
	dependencies?: Partial<SessionStoreDependencies>;
}

const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000;

/**
 * Conversation-scoped Steel session reuse.
 *
 * Explicit persistence across a manual browser close is intentionally out of scope here.
 * This store exists to keep a session alive across turns until later slices add deterministic
 * release-on-close wiring.
 */
export class BrowserSessionStore {
	private readonly sessions = new Map<string, SessionStoreEntry>();
	private readonly idleTimeoutMs: number;
	private readonly deps: SessionStoreDependencies;

	constructor(options: SessionStoreOptions = {}) {
		this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
		this.deps = {
			createSession: createBrowserSession,
			releaseSession: releaseBrowserSession,
			navigateSession: navigateBrowserSession,
			now: () => Date.now(),
			...options.dependencies,
		};
	}

	get(conversationId: string): SessionStoreEntry | undefined {
		return this.sessions.get(conversationId);
	}

	markUsed(conversationId: string): SessionStoreEntry | undefined {
		const session = this.sessions.get(conversationId);
		if (!session) return undefined;
		session.lastUsedAt = this.deps.now();
		return session;
	}

	async getOrCreate(
		conversationId: string,
		initial?: { query?: string; url?: string }
	): Promise<SessionStoreEntry | null> {
		const existing = this.sessions.get(conversationId);
		if (existing) {
			this.markUsed(conversationId);
			logger.debug(
				{ conversationId, sessionId: existing.sessionId },
				"[steel] reusing browser session from conversation store"
			);
			return existing;
		}

		const created = await this.deps.createSession(initial?.query, initial?.url);
		if (!created) return null;

		const entry: SessionStoreEntry = {
			...created,
			conversationId,
			lastUsedAt: this.deps.now(),
		};
		this.sessions.set(conversationId, entry);
		logger.debug(
			{ conversationId, sessionId: entry.sessionId },
			"[steel] created browser session in conversation store"
		);
		return entry;
	}

	async navigate(
		conversationId: string,
		target: { query?: string; url?: string }
	): Promise<SessionStoreEntry | null> {
		const session = this.sessions.get(conversationId);
		if (!session) {
			logger.debug({ conversationId }, "[steel] no browser session available to navigate");
			return null;
		}

		await this.deps.navigateSession(session.sessionId, target.query, target.url);
		this.markUsed(conversationId);
		logger.debug(
			{ conversationId, sessionId: session.sessionId },
			"[steel] navigated existing browser session from conversation store"
		);
		return session;
	}

	async release(conversationId: string, reason = "manual"): Promise<boolean> {
		const session = this.sessions.get(conversationId);
		if (!session) return false;
		this.sessions.delete(conversationId);
		await this.deps.releaseSession(session.sessionId);
		logger.debug(
			{ conversationId, sessionId: session.sessionId, reason },
			"[steel] released browser session from conversation store"
		);
		return true;
	}

	async cleanupExpired(): Promise<string[]> {
		const now = this.deps.now();
		const releasedConversationIds: string[] = [];
		for (const [conversationId, session] of this.sessions) {
			if (now - session.lastUsedAt < this.idleTimeoutMs) continue;
			releasedConversationIds.push(conversationId);
			this.sessions.delete(conversationId);
			await this.deps.releaseSession(session.sessionId);
			logger.debug(
				{ conversationId, sessionId: session.sessionId, idleTimeoutMs: this.idleTimeoutMs },
				"[steel] released idle browser session from conversation store"
			);
		}
		return releasedConversationIds;
	}

	size(): number {
		return this.sessions.size;
	}
}

export const browserSessionStore = new BrowserSessionStore();
