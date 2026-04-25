# External Integrations

**Analysis Date:** 2026-04-25

## APIs & External Services

**LLM inference (canonical path):**
- Any OpenAI-compatible HTTP API addressed via `OPENAI_BASE_URL` (default points at HuggingFace Router `https://router.huggingface.co/v1`; an alternate base can be configured for `OpenCode`).
  - SDK/Client: `openai` ^4.44.
  - Auth: `OPENAI_API_KEY` (canonical) or legacy `HF_TOKEN` alias.
  - Implementation: `src/lib/server/endpoints/openai/endpointOai.ts`. Streaming adapters under the same folder convert OpenAI chat/completion streams into the internal `TextGenerationStreamOutput` shape from `@huggingface/inference`.
- HuggingFace Router (when `OPENAI_BASE_URL` is the HF router URL): the `models.ts` registry detects `isHFRouter` and parses provider tool-support metadata from the router's `/models` listing.
- OpenCode endpoint: `OPENCODE_BASE_URL` + `OPENCODE_API_KEY` + `OPENCODE_MODELS` for an alternate OpenAI-compatible upstream.
- Transcription service: `src/routes/api/transcribe/+server.ts` posts audio to the configured `TRANSCRIPTION_MODEL` (HF endpoint) using `getApiToken(locals)`. Accepts `audio/webm|ogg|wav|flac|mpeg|mp4|x-wav` up to 25 MB with a 60 s timeout.

**LLM Router (Omni / Arch-Router):**
- Custom routing layer in `src/lib/server/router/`. Calls an Arch-Router endpoint (`LLM_ROUTER_ARCH_BASE_URL`, model `LLM_ROUTER_ARCH_MODEL`) over OpenAI-compatible JSON.
- Routes definition: JSON file at `LLM_ROUTER_ROUTES_PATH`.
- Shortcuts: `LLM_ROUTER_ENABLE_TOOLS` (auto-pick a tools-capable model), `LLM_ROUTER_ENABLE_MULTIMODAL` (bypass router for multimodal turns and use `LLM_ROUTER_MULTIMODAL_MODEL`), `LLM_ROUTER_FALLBACK_MODEL`, `LLM_ROUTER_OTHER_ROUTE`, `LLM_ROUTER_ARCH_TIMEOUT_MS`, `LLM_ROUTER_MAX_PREV_USER_LENGTH`, `LLM_ROUTER_MAX_ASSISTANT_LENGTH`.
- Public-facing alias: `PUBLIC_LLM_ROUTER_ALIAS_ID`, `PUBLIC_LLM_ROUTER_DISPLAY_NAME`, `PUBLIC_LLM_ROUTER_LOGO_URL`.

**Model Context Protocol (MCP):**
- `MCP_SERVERS` env var (JSON array of `{ url, headers? }`) defines remote MCP endpoints.
- SDK/Client: `@modelcontextprotocol/sdk` ^1.26 — `Client` with `StreamableHTTPClientTransport` (preferred) and `SSEClientTransport` (fallback). Wrapped in `src/lib/server/mcp/clientPool.ts` with SSRF-safe fetch from `src/lib/server/urlSafety.ts`.
- Tool execution: `src/lib/server/textGeneration/mcp/runMcpFlow.ts` and `toolInvocation.ts` translate MCP tools into OpenAI function-calling parameters.
- Health/list endpoints: `src/routes/api/mcp/health/+server.ts`, `src/routes/api/mcp/servers/+server.ts`.
- Optional flags: `MCP_FORWARD_HF_USER_TOKEN`, `MCP_TOOL_TIMEOUT_MS`.

**Cloud Browser (Steel):**
- Service: Steel cloud browser (or self-hosted Steel) — used for tool-capable web browsing.
- SDK/Client: `steel-sdk` ^0.18, paired with `playwright-core` ^1.59 for in-session navigation.
- Auth: `STEEL_API_KEY` for cloud; if `STEEL_BASE_URL` is provided (self-hosted) the API key is optional.
- Implementation: `src/lib/server/browser/steel.ts`. Optional `STEEL_PUBLIC_DEBUG_URL` rewrites session debug URLs for public exposure. `STEEL_BROWSER_TOOL_PATTERNS` filters which tool calls trigger a session.

**Search (Exa):**
- `EXA_API_KEY` referenced in `src/lib/server/config.ts` — feeds search-tool integrations.

**HuggingFace Hub uploads:**
- `@huggingface/hub` ^2.2 (`uploadFile`) used in `src/routes/admin/export/+server.ts` to publish parquet exports. Uses `PARQUET_EXPORT_HF_TOKEN` and `PARQUET_EXPORT_DATASET`.

**Outbound web fetch:**
- `src/routes/api/fetch-url/+server.ts` retrieves remote URLs through `undici` with SSRF guards in `src/lib/server/urlSafety.ts` (uses `ip-address` to block private/loopback ranges).

## Data Storage

**Databases:** MongoDB.
- Connection env var: `MONGODB_URL`. When unset, falls back to an embedded `mongodb-memory-server` (binary version `7.0.18`) persisting under `MONGO_STORAGE_PATH` (default `./db`).
- Driver: `mongodb` ^5.8. Optional `MONGODB_DIRECT_CONNECTION=true` for single-node replica sets.
- DB name: `MONGODB_DB_NAME` (suffixed with `-test` in test mode).
- Collections (created in `src/lib/server/database.ts`): `conversations`, `conversations.stats`, `assistants`, `reports`, `sharedConversations`, `abortedGenerations` (TTL 30 s), `settings`, `users`, `sessions` (TTL on `expiresAt`), `messageEvents` (TTL 1 s on `expiresAt`), `semaphores` (TTL 1 s on `deleteAt`), `tokens` (TTL 5 min on `createdAt`), `tools`, `migrationResults`, `config`, `billingEntitlements`.
- Read preference: `secondaryPreferred` for `assistants`, `conversations.stats`, `reports`, `tools`; primary elsewhere for read-after-write consistency.

**File Storage:** MongoDB GridFS bucket named `files` (see `GridFSBucket(db, { bucketName: "files" })` in `database.ts`). Used by `src/lib/server/files/uploadFile.ts` and `downloadFile.ts` for chat attachments. Static frontend assets served from `static/` via SvelteKit.

**Caching:** None external. In-memory caches: MCP client pool (`src/lib/server/mcp/clientPool.ts`), models registry (`cachedModels` in `src/lib/server/router/endpoint.ts`), DB-backed `tokens` collection (5 min TTL) for cached identity resolution.

## Authentication & Identity

**Auth Provider:** Clerk (primary).
- SDK: `@clerk/backend` ^3.3 in `src/lib/server/clerk.ts`. Authentication routed through `authenticateClerkRequest`; user profiles synced via `src/lib/server/syncAuthenticatedUser.ts`.
- Required env: `PUBLIC_CLERK_PUBLISHABLE_KEY` plus `CLERK_SECRET_KEY` and/or `CLERK_JWT_KEY`. Browser sign-in URL `PUBLIC_CLERK_SIGN_IN_URL` (and `PUBLIC_CLERK_SIGN_UP_URL`) are required to enable login redirects.
- Authorized parties include the request origin, `PUBLIC_ORIGIN`, plus localhost during dev.

**Alternate identity paths in `src/lib/server/auth.ts`:**
- Trusted reverse-proxy header: when `TRUSTED_EMAIL_HEADER` is set, requests with that header are auto-authenticated as anonymous users.
- Cookie session: `COOKIE_NAME` (HttpOnly, `addWeeks(2)`); `COOKIE_SAMESITE` and `COOKIE_SECURE` defaulted from `dev` mode and `ALLOW_INSECURE_COOKIES`. Optional cookie pinning via `COUPLE_SESSION_WITH_COOKIE_NAME` (SHA-256 hashed value compared on every request).
- Allow-listing: `ALLOWED_USER_EMAILS` and `ALLOWED_USER_DOMAINS` (JSON arrays).
- Admin: `ADMIN_TOKEN`, `ADMIN_API_SECRET`, `ADMIN_CLI_LOGIN` for the admin token manager (`src/lib/server/adminToken.ts`).
- Legacy OpenID Connect support remains in `src/routes/.well-known/oauth-cimd/+server.ts` (env: `OPENID_CLIENT_ID`, `OPENID_SCOPES`); active path is Clerk.
- HuggingChat-style automatic anonymous login governed by `AUTOMATIC_LOGIN`.

**Sessions:** Stored in MongoDB `sessions` collection. Session id is SHA-256 of a UUID stored client-side in `COOKIE_NAME`. Session TTL is 2 weeks.

## Monitoring & Observability

**Error Tracking:** None integrated (no Sentry/Datadog/Honeybadger imports). Errors flow through `pino` and SvelteKit `error()` helpers.

**Logs:** `pino` ^9 with optional `pino-pretty` formatter (`src/lib/server/logger.ts`). Log level controlled by `LOG_LEVEL`.

**Metrics:** Prometheus via `prom-client` ^15.1 (`src/lib/server/metrics.ts`). Default Node metrics plus per-model counters (`conversationsTotal`, `messagesTotal`, `tokenCountTotal`) and summaries (`timePerOutputToken`, `timeToFirstToken`, `latency`). Enabled by `METRICS_ENABLED=true`; standalone HTTP server on `METRICS_PORT`. Endpoint also exposed via SvelteKit at `src/routes/metrics/+server.ts`.

**Health checks:** `src/routes/healthcheck/+server.ts` (Railway healthcheck path is `/healthcheck`).

**Analytics:** Optional Google Analytics gtag.js loader in `src/app.html`, gated on `PUBLIC_GOOGLE_ANALYTICS_ID`. Defaults to `consent: denied` for `ad_storage` and `analytics_storage` until consent is granted.

## CI/CD & Deployment

**Hosting:** Container-based; supported targets include Railway (`railway.json`), HuggingFace Spaces (Dockerfile uses `user` UID 1000), and any Docker host. Default app port `3000` (override via `PORT`).

**CI Pipeline:** GitHub Actions in `.github/workflows/`:
- `lint-and-test.yml` — Node 20, runs `npm run lint`, `npm run check`, `npm run test` (Playwright installed), then a Docker build smoke test (`INCLUDE_DB=true`) that boots the container and probes `http://localhost:3000/`.
- `build-image.yml` — publishes Docker images on push to `main`, releases, and Dockerfile/entrypoint PRs.
- `build-docs.yml`, `build-pr-docs.yml`, `upload-pr-documentation.yml` — docs pipeline.
- `deploy-dev.yml`, `deploy-prod.yml` — deployment pipelines.
- `slugify.yaml` — slug helper.
- `trufflehog.yml` — secret scanning on PRs.

**Local hooks:** Husky 9 (`.husky/pre-commit` runs `lint-staged` per `.husky/lint-stage-config.js`).

## Environment Configuration

**Required env vars (names only):**
- LLM core: `OPENAI_BASE_URL`, `OPENAI_API_KEY` (or legacy `HF_TOKEN`), `TASK_MODEL`, `LLM_SUMMARIZATION`, `USE_USER_TOKEN`.
- OpenCode (optional): `OPENCODE_BASE_URL`, `OPENCODE_API_KEY`, `OPENCODE_MODELS`.
- Router: `LLM_ROUTER_ROUTES_PATH`, `LLM_ROUTER_ARCH_BASE_URL`, `LLM_ROUTER_ARCH_MODEL`, `LLM_ROUTER_ARCH_TIMEOUT_MS`, `LLM_ROUTER_ENABLE_TOOLS`, `LLM_ROUTER_ENABLE_MULTIMODAL`, `LLM_ROUTER_MULTIMODAL_MODEL`, `LLM_ROUTER_FALLBACK_MODEL`, `LLM_ROUTER_OTHER_ROUTE`, `LLM_ROUTER_MAX_PREV_USER_LENGTH`, `LLM_ROUTER_MAX_ASSISTANT_LENGTH`, `PUBLIC_LLM_ROUTER_ALIAS_ID`, `PUBLIC_LLM_ROUTER_DISPLAY_NAME`, `PUBLIC_LLM_ROUTER_LOGO_URL`.
- MCP: `MCP_SERVERS`, `MCP_FORWARD_HF_USER_TOKEN`, `MCP_TOOL_TIMEOUT_MS`.
- Database: `MONGODB_URL`, `MONGODB_DB_NAME`, `MONGODB_DIRECT_CONNECTION`, `MONGO_STORAGE_PATH`.
- Auth (Clerk): `PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `PUBLIC_CLERK_SIGN_IN_URL`, `PUBLIC_CLERK_SIGN_UP_URL`.
- Auth (general): `COOKIE_NAME`, `COOKIE_SAMESITE`, `COOKIE_SECURE`, `ALLOW_INSECURE_COOKIES`, `COUPLE_SESSION_WITH_COOKIE_NAME`, `TRUSTED_EMAIL_HEADER`, `ALLOWED_USER_EMAILS`, `ALLOWED_USER_DOMAINS`, `AUTOMATIC_LOGIN`, `OPENID_CLIENT_ID`, `OPENID_SCOPES`.
- Admin: `ADMIN_TOKEN`, `ADMIN_API_SECRET`, `ADMIN_CLI_LOGIN`, `EXPOSE_API`.
- Billing (Stripe): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO`, `PAYWALL_ENABLED`.
- Browser (Steel): `STEEL_API_KEY`, `STEEL_BASE_URL`, `STEEL_PUBLIC_DEBUG_URL`, `STEEL_BROWSER_TOOL_PATTERNS`.
- Search: `EXA_API_KEY`.
- Exports: `PARQUET_EXPORT_SECRET`, `PARQUET_EXPORT_HF_TOKEN`, `PARQUET_EXPORT_DATASET`.
- App: `PUBLIC_ORIGIN`, `PUBLIC_APP_NAME`, `PUBLIC_APP_ASSETS`, `PUBLIC_VERSION`, `PUBLIC_COMMIT_SHA`, `PUBLIC_GOOGLE_ANALYTICS_ID`, `APP_BASE`, `ALLOW_IFRAME`, `RATE_LIMIT`, `USAGE_LIMITS`, `BODY_SIZE_LIMIT`, `PORT`.
- Observability: `LOG_LEVEL`, `METRICS_ENABLED`, `METRICS_PORT`.
- Feature flags: `ENABLE_ASSISTANTS`, `ENABLE_DATA_EXPORT`, `ENABLE_CONFIG_MANAGER`.
- Build: `ADAPTER`, `VITEST_BROWSER`, `DOTENV_LOCAL`.

**Secrets location:** Local development loads from `.env.local` (overrides `.env`); CI uses `.env.ci` (lightweight defaults). In production containers, `entrypoint.sh` writes the `DOTENV_LOCAL` env value to `/app/.env.local` at boot. Hot-overridable values may also be stored in MongoDB `config` collection when `ENABLE_CONFIG_MANAGER=true`. Never commit secret values; `.env`, `.env.*`, and `*.env` are present and treated as secret-bearing files.

## Webhooks & Callbacks

**Incoming:**
- `POST /api/v2/billing/webhook` — Stripe webhook (`src/routes/api/v2/billing/webhook/+server.ts`). Verifies signature with `STRIPE_WEBHOOK_SECRET` and `stripe-signature` header. Updates `billingEntitlements` MongoDB collection from subscription events.
- `GET /healthcheck` — liveness probe (consumed by Railway).
- `GET /metrics` — Prometheus scrape target.
- `GET /.well-known/oauth-cimd` — OAuth discovery document for the legacy CIMD path.
- `GET /api/mcp/health`, `GET /api/mcp/servers` — MCP status endpoints consumed by the UI.

**Outgoing:**
- LLM streaming requests → `OPENAI_BASE_URL` (and `LLM_ROUTER_ARCH_BASE_URL`).
- HuggingFace Inference / transcription → HF inference endpoints via `getApiToken`.
- HuggingFace Hub uploads → `huggingface.co` API for parquet datasets.
- MCP servers → URLs declared in `MCP_SERVERS` (Streamable HTTP, SSE fallback) through `ssrfSafeFetch`.
- Steel cloud → `https://api.steel.dev` (default) or `STEEL_BASE_URL`; debug WebSocket links rewritten for public access.
- Stripe API → checkout sessions (`src/routes/api/v2/billing/checkout/+server.ts`) and customer portal (`src/routes/api/v2/billing/portal/+server.ts`).
- Generic `/api/fetch-url` proxy — guarded by `ssrfSafeFetch`.

---
*Integration audit: 2026-04-25*
