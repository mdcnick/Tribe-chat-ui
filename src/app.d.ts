/// <reference types="@sveltejs/kit" />
/// <reference types="unplugin-icons/types/svelte" />

import type { User } from "$lib/types/User";

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			sessionId: string;
			user?: User;
			isAdmin: boolean;
			token?: string;
			clerkAuth?: {
				clerkUserId: string;
				clerkSessionId?: string;
			};
			/** Organization to bill inference requests to (from settings) */
			billingOrganization?: string;
			/** User-provided API key for the Opencode Go API */
			opencodeApiKey?: string;
			/** MCP server selection for the current request */
			mcp?: {
				selectedServerNames?: string[];
				selectedServers?: Array<{
					name: string;
					url: string;
					headers?: Record<string, string>;
				}>;
			};
		}

		interface Error {
			message: string;
			errorId?: ReturnType<typeof crypto.randomUUID>;
		}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
