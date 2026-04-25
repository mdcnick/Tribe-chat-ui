# Technology Stack

**Analysis Date:** 2026-04-25

## Languages

**Primary:**
- TypeScript ~5.5 (strict mode) — server code in `src/lib/server/`, types in `src/lib/types/`, route handlers (`+server.ts`, `+page.server.ts`).
- Svelte 5.53+ (runes: `$state`, `$effect`, `$bindable`) — UI components in `src/lib/components/` and routes under `src/routes/`.

**Secondary:**
- JavaScript (CommonJS) — Tooling configs only: `tailwind.config.cjs`, `.eslintrc.cjs`, `postcss.config.js`.
- Bash — `entrypoint.sh` and `.husky/pre-commit`.
- Dockerfile — multi-stage build defined in `Dockerfile`.

## Runtime

**Environment:** Node.js 24 (slim) at runtime per `Dockerfile` (`FROM node:24-slim AS base`, `FROM node:24 AS builder`). CI in `.github/workflows/lint-and-test.yml` pins Node 20 for lint/test jobs. `tsconfig.json` targets `ES2018`.

**Package Manager:** npm 9.5.0 (declared in `package.json` `packageManager` field). Lockfile `package-lock.json` is present (committed). `.npmrc` enforces `engine-strict=true`. No yarn or pnpm lockfile.

## Frameworks

**Core:**
- SvelteKit 2.52+ (`@sveltejs/kit`) — full-stack framework with file-based routing under `src/routes/`. Configured in `svelte.config.js`.
- Svelte 5.53+ — UI runtime; preprocessed via `vitePreprocess()`.
- TailwindCSS 3.4 (JIT, `darkMode: "class"`) — config in `tailwind.config.cjs` with `tailwind-scrollbar` and `@tailwindcss/typography` plugins. PostCSS pipeline in `postcss.config.js` chains `tailwindcss` then `autoprefixer`.
- bits-ui 2.14+ — accessible Svelte primitives (Select, DropdownMenu) for rich dropdowns; prefer over native `<select>` when icons/images are needed.

**Adapters:**
- `@sveltejs/adapter-node` 5.2+ — default production adapter; output executed via `node /app/build/index.js`.
- `@sveltejs/adapter-static` 3.0+ — selected when `ADAPTER=static` env var is set (`build:static` script).

**Testing:**
- Vitest 3.1 — test runner with three workspace projects defined in `vite.config.ts`:
  - `client` (browser via Playwright Chromium, opt-in via `VITEST_BROWSER=true`) — runs `src/**/*.svelte.{test,spec}.{js,ts}` with `scripts/setups/vitest-setup-client.ts`.
  - `ssr` (node) — runs `src/**/*.ssr.{test,spec}.{js,ts}`.
  - `server` (node, 30s test/hook timeout) — runs `src/**/*.{test,spec}.{js,ts}` with `scripts/setups/vitest-setup-server.ts`.
- Playwright 1.55 + `playwright-core` 1.59 — browser harness for client tests and headless navigation in `src/lib/server/browser/steel.ts`.
- `vitest-browser-svelte` 0.1 — Svelte component matchers.
- `mongodb-memory-server` 10.1 — spins up an in-memory MongoDB 7.0.18 binary in tests and as a fallback when `MONGODB_URL` is not set.

**Build/Dev:**
- Vite 6.3 (`vite dev`, `vite build`, `vite preview`) — dev server defaults to port 5173 (overridable via `PORT`); accepts `huggingface.ngrok.io` as an additional allowed host.
- `unplugin-icons` 0.16 (svelte compiler) — exposes `~icons/carbon/*`, `~icons/lucide/*`, `~icons/eos-icons/*`, `~icons/bi/*` from `@iconify-json/*` packages.
- Custom Vite plugin `loadTTFAsArrayBuffer` in `vite.config.ts` — loads `.ttf` fonts as `Uint8Array.buffer` for server-side OG image rendering with `satori`.
- `vite-node` 3.0 — runs CLI scripts under `scripts/` (`updateLocalEnv.ts`, `populate.ts`, `config.ts`).
- `dotenv` 17.4 — loads `.env.local` (override) then `.env` in `svelte.config.js` and `vite.config.ts`.
- `svelte-check` 4.0 + `svelte-kit sync` — type-check pipeline.

## Key Dependencies

**Critical (LLM / chat):**
- `openai` ^4.44 — sole client used to call any OpenAI-compatible LLM via `OPENAI_BASE_URL`. Imported in `src/lib/server/endpoints/openai/endpointOai.ts` and the streaming adapters in the same folder.
- `@huggingface/inference` ^4.11 — provides `InferenceProvider` types and `TextGenerationStreamOutput` shape consumed by the OpenAI streaming adapters (`openAIChatToTextGenerationStream.ts`, `openAICompletionToTextGenerationStream.ts`).
- `@huggingface/hub` ^2.2 — `uploadFile` used in `src/routes/admin/export/+server.ts` for parquet uploads.
- `@modelcontextprotocol/sdk` ^1.26 — MCP `Client`, `StreamableHTTPClientTransport`, `SSEClientTransport` used in `src/lib/server/mcp/clientPool.ts`, `tools.ts`, and `src/routes/api/mcp/{health,servers}/+server.ts`.
- `handlebars` ^4.7 + custom `Template` (in `src/lib/utils/template.ts`) — chat prompt templating.

**Critical (data / persistence):**
- `mongodb` ^5.8 (`MongoClient`, `GridFSBucket`, `ObjectId`, `ReadPreference`) — DB access in `src/lib/server/database.ts`. GridFS bucket name `files`. SecondaryPreferred read preference for `assistants`, `conversations.stats`, `reports`, `tools`.
- `bson-objectid` ^2.0 — lightweight ObjectId generation in places where the full driver is not needed.

**Critical (auth / billing / browser):**
- `@clerk/backend` ^3.3 — primary auth provider (`createClerkClient`) in `src/lib/server/clerk.ts`.
- `stripe` ^18.5 — billing SDK in `src/lib/server/billing/stripe.ts`; webhook handler in `src/routes/api/v2/billing/webhook/+server.ts`.
- `steel-sdk` ^0.18 — cloud browser session control in `src/lib/server/browser/steel.ts`, paired with `playwright-core` for in-session navigation.

**Validation / parsing:**
- `zod` ^3.22 — schemas everywhere (auth, models, endpoints, settings, billing).
- `superjson` ^2.2 — wire format for v2 API responses (`src/lib/server/api/utils/superjsonResponse.ts`).
- `json5` ^2.2 — tolerant parser for JSON-shaped env vars (`ALLOWED_USER_EMAILS`, etc.).

**Rendering / content:**
- `marked` ^12 — Markdown rendering.
- `katex` ^0.16 (+ `@types/katex`) — math rendering.
- `highlight.js` ^11.7 — code syntax highlighting.
- `htmlparser2` ^10 — HTML parsing for rendered markdown.
- `isomorphic-dompurify` ^3.8 — sanitizer for both server and client.
- `satori` ^0.10 + `satori-html` ^0.3 + `@resvg/resvg-js` ^2.6 — server-side OG/share image generation (`src/routes/models/[...model]/thumbnail.png/+server.ts`).
- `sharp` ^0.33 — image processing for multimodal uploads (`src/lib/server/endpoints/images.ts`).
- `file-type` ^21.3 + `mime-types` ^2.1 — MIME detection for uploaded files.

**HTTP / infrastructure:**
- `undici` ^7.18 — `Agent` and `fetch` used by `src/lib/server/urlSafety.ts` for SSRF-safe outbound requests.
- `pino` ^9 + `pino-pretty` ^11 — structured logging (`src/lib/server/logger.ts`).
- `prom-client` ^15.1 — Prometheus metrics in `src/lib/server/metrics.ts`. Exposes Counter, Summary, default metrics; dedicated HTTP server when `METRICS_ENABLED=true` (port `METRICS_PORT`).
- `parquetjs` ^0.11 — admin data exports (`src/routes/admin/export/+server.ts`).
- `yazl` ^3.3 — zip writer for export bundles.
- `nanoid` ^5 + `uuid` ^10 — id generators.
- `ip-address` ^9 — CIDR/host validation for SSRF protection.
- `web-haptics` ^0.0.6 — haptic feedback hook on mobile.

**Dev-only:**
- `@faker-js/faker` ^8.4 — seed/sample data generation.
- `@types/node` ^22.1, `@types/uuid`, `@types/katex`, `@types/mime-types`, `@types/parquetjs`, `@types/yazl`, `@types/js-yaml`, `@types/minimist`.
- `husky` ^9 + `lint-staged` ^15.2 — pre-commit hook runs `npx lint-staged --config ./.husky/lint-stage-config.js` (configured in `.husky/pre-commit`).
- `eslint` ^8.28 with `@typescript-eslint` ^6, `eslint-plugin-svelte` ^2.45, `eslint-config-prettier` ^8.5 — rules in `.eslintrc.cjs` (no `any`, no non-null assertions, `argsIgnorePattern: "^_"`, `object-shorthand` enforced).
- `prettier` ^3.5 + `prettier-plugin-svelte` ^3.2 + `prettier-plugin-tailwindcss` ^0.6 — config in `.prettierrc` (tabs, trailing comma `es5`, print width 100).

## Configuration

**Environment:** Loaded by SvelteKit's `$env/dynamic/private` and `$env/dynamic/public` and surfaced through a custom `ConfigManager` in `src/lib/server/config.ts`. The manager merges static env values with hot-overridable values stored in MongoDB (collection `config`) when `ENABLE_CONFIG_MANAGER=true`. Use `config.<KEY>` (typed) instead of `process.env.<KEY>` in server code; `process.env` is only used in `src/lib/server/adminToken.ts` and `src/lib/server/hooks/init.ts`. Feature flag `publicConfig.isHuggingChat` (driven by `PUBLIC_APP_ASSETS === "huggingchat"`) gates HuggingChat-specific UX.

**Env files present (do not read):** `.env`, `.env.ci`, `.env.local`. Wrap `.env.local` with `dotenv.config({ path: "./.env.local", override: true })` before reading `.env`.

**Build:**
- `svelte.config.js` — selects adapter via `ADAPTER`, sets `paths.base = APP_BASE`, sets CSP `frame-ancestors` to `https://huggingface.co` unless `ALLOW_IFRAME=true`, marks all origins trusted in `csrf` (real check is in `hooks.server.ts`). Auto-populates `PUBLIC_VERSION` from `package.json` and `PUBLIC_COMMIT_SHA` from `git rev-parse HEAD`.
- `vite.config.ts` — Svelte plugin, icons plugin, ttf loader, vitest workspaces.
- `tsconfig.json` — extends `.svelte-kit/tsconfig.json`, `strict: true`, `target: ES2018`, `allowJs: true`, `checkJs: true`, excludes `vite.config.ts`.
- `tailwind.config.cjs` — JIT, custom gray scale, `xxs`/`smd` font sizes.
- `.dockerignore` and `.gitignore` — present.
- `.husky/lint-stage-config.js` — lint-staged invocation list.

## Platform Requirements

**Development:**
- Node 20+ (CI lint/test), Node 24 (Docker). Use `npm ci` for reproducible installs. Run `npm run dev` (port 5173). Optional MongoDB via `docker-compose.yml` (mongo:8 single-node replica set `rs0`) — only needed if `MONGODB_URL` is set; otherwise an in-memory MongoDB 7.0.18 server starts automatically and persists to `./db`.
- Devcontainer: `.devcontainer/devcontainer.json` builds from `Dockerfile`, includes Prettier, ESLint, and Svelte VS Code extensions and docker-in-docker.

**Production:**
- Container image built via `Dockerfile` (multi-stage: base, builder, optional `mongo:7` stage when `INCLUDE_DB=true`). Final stage runs `entrypoint.sh` which writes `DOTENV_LOCAL` to `.env.local`, optionally launches `mongod`, and starts `node --dns-result-order=ipv4first /app/build/index.js -- --host 0.0.0.0 --port ${PORT:-3000}`. Body size limit `BODY_SIZE_LIMIT=15728640` (15 MB).
- Railway-ready: `railway.json` declares `healthcheckPath: /healthcheck`, `restartPolicyType: ON_FAILURE`, `restartPolicyMaxRetries: 10`.
- HuggingFace Spaces: `Dockerfile` carries Spaces-friendly user setup (`useradd -m -u 1000 user`).

---
*Stack analysis: 2026-04-25*
