import { sveltekit } from "@sveltejs/kit/vite";
import Icons from "unplugin-icons/vite";
import { promises } from "fs";
import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: "./.env.local" });

// SvelteKit 2.58 references compile-time tokens (`__SVELTEKIT_PAYLOAD__` etc.)
// in its runtime client files. Vite is supposed to replace these via the kit
// plugin's `define` map, but in this project the substitution doesn't reach
// `@sveltejs/kit/src/runtime/app/paths/internal/client.js` and
// `@sveltejs/kit/src/runtime/client/client.js` when they're served raw from
// node_modules (they're in `optimizeDeps.exclude`). The unreplaced tokens
// throw a ReferenceError at hydration time, which kills *all* client-side
// interactivity — including the model picker click handler.
//
// We patch those two files in a Vite transform so the dev/build runtime gets
// the same substitutions the kit plugin would have applied.
function patchSvelteKitRuntimeDefines() {
	const SVELTEKIT_RUNTIME_RE =
		/@sveltejs[\\/]+kit[\\/]+src[\\/]+runtime[\\/]+(app[\\/]+paths[\\/]+internal[\\/]+client|client[\\/]+client)\.js$/;
	const replacements: Record<string, string> = {
		__SVELTEKIT_PAYLOAD__: "globalThis.__sveltekit_dev",
		__SVELTEKIT_PATHS_BASE__: '""',
		__SVELTEKIT_PATHS_ASSETS__: '""',
		__SVELTEKIT_PATHS_RELATIVE__: "true",
		__SVELTEKIT_APP_DIR__: '"_app"',
		__SVELTEKIT_HASH_ROUTING__: "false",
		__SVELTEKIT_CLIENT_ROUTING__: "true",
		__SVELTEKIT_EMBEDDED__: "false",
		__SVELTEKIT_FORK_PRELOADS__: "false",
		__SVELTEKIT_SERVER_TRACING_ENABLED__: "false",
		__SVELTEKIT_EXPERIMENTAL_USE_TRANSFORM_ERROR__: "false",
		__SVELTEKIT_APP_VERSION_POLL_INTERVAL__: "0",
		__SVELTEKIT_HAS_SERVER_LOAD__: "true",
		__SVELTEKIT_HAS_UNIVERSAL_LOAD__: "true",
	};
	return {
		name: "patch-sveltekit-runtime-defines",
		enforce: "pre" as const,
		transform(code: string, id: string) {
			const cleanId = id.split("?")[0];
			if (!SVELTEKIT_RUNTIME_RE.test(cleanId)) return null;
			let out = code;
			for (const [token, value] of Object.entries(replacements)) {
				out = out.split(token).join(value);
			}
			return out === code ? null : { code: out, map: null };
		},
	};
}

// used to load fonts server side for thumbnail generation
function loadTTFAsArrayBuffer() {
	return {
		name: "load-ttf-as-array-buffer",
		async transform(_src, id) {
			if (id.endsWith(".ttf")) {
				return `export default new Uint8Array([
			${new Uint8Array(await promises.readFile(id))}
		  ]).buffer`;
			}
		},
	};
}
export default defineConfig({
	plugins: [
		patchSvelteKitRuntimeDefines(),
		sveltekit(),
		Icons({
			compiler: "svelte",
		}),
		loadTTFAsArrayBuffer(),
	],
	// Allow external access via ngrok tunnel host
	server: {
		port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
		// Allow any ngrok-free.app subdomain (dynamic tunnels)
		// See Vite server.allowedHosts: string[] | true
		// Using leading dot matches subdomains per Vite's host check logic
		allowedHosts: ["huggingface.ngrok.io"],
	},
	optimizeDeps: {
		include: ["uuid", "sharp", "clsx"],
	},
	ssr: {
		// Force Vite to bundle these ESM packages that import CJS mongodb.
		// Without this, Vite's module runner can't resolve named CJS exports
		// (UUID from mongodb) when evaluating ESM files in its VM context.
		noExternal: ["@better-auth/mongo-adapter", "better-auth"],
	},
	test: {
		workspace: [
			...(process.env.VITEST_BROWSER === "true"
				? [
						{
							// Client-side tests (Svelte components), opt-in due flaky browser harness in CI/local
							extends: "./vite.config.ts",
							test: {
								name: "client",
								environment: "browser",
								browser: {
									enabled: true,
									provider: "playwright",
									instances: [{ browser: "chromium", headless: true }],
								},
								include: ["src/**/*.svelte.{test,spec}.{js,ts}"],
								exclude: ["src/lib/server/**", "src/**/*.ssr.{test,spec}.{js,ts}"],
								setupFiles: ["./scripts/setups/vitest-setup-client.ts"],
							},
						},
					]
				: []),
			{
				// SSR tests (Server-side rendering)
				extends: "./vite.config.ts",
				test: {
					name: "ssr",
					environment: "node",
					include: ["src/**/*.ssr.{test,spec}.{js,ts}"],
				},
			},
			{
				// Server-side tests (Node.js utilities)
				extends: "./vite.config.ts",
				test: {
					name: "server",
					environment: "node",
					include: ["src/**/*.{test,spec}.{js,ts}"],
					exclude: ["src/**/*.svelte.{test,spec}.{js,ts}", "src/**/*.ssr.{test,spec}.{js,ts}"],
					setupFiles: ["./scripts/setups/vitest-setup-server.ts"],
					testTimeout: 30000,
					hookTimeout: 30000,
				},
			},
		],
	},
});
