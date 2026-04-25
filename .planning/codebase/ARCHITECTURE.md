# Architecture

**Analysis Date:** 2026-04-25

## Pattern Overview

**Overall:** SvelteKit full-stack app with a layered server-side runtime that pipes OpenAI-compatible streaming output to the client over JSONL. Backed by MongoDB (or in-process MongoMemoryServer) and an OpenID-Connect / Clerk auth surface.

**Key Characteristics:**
- File-based routing via SvelteKit (`+page.svelte`, `+page.ts`, `+page.server.ts`, `+server.ts`).
- Hard separation of `src/lib/server/**` (Node-only, never bundled into the client) from `src/lib/**` shared modules and `src/lib/components/**` UI.
- Streaming-first request model. The chat endpoint returns `application/jsonl`; every `MessageUpdate` is one JSON line.
- Async-generator pipelines compose the LLM stream (title generation, MCP tool flow, raw token stream, keep-alive heartbeat) using `mergeAsyncGenerators` (`src/lib/utils/mergeAsyncGenerators.ts`).
- Singleton "managers" for cross-request state: `Database`, `MetricsServer`, `AbortRegistry`, `AbortedGenerations`, `ConfigManager`.
- All inference goes through a single OpenAI client (`src/lib/server/endpoints/openai/endpointOai.ts`); the optional Arch-Router (Omni) and MCP tool flow wrap that call.
- Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`, `$bindable`) are used in components; legacy Svelte stores live in `src/lib/stores/`.

## Layers

**Routing / HTTP edge:**
- Purpose: Map HTTP routes to handlers, run global middleware (auth, CSRF, CORS, CSP, rate-limit).
- Location: `src/routes/`, `src/hooks.server.ts`, `src/lib/server/hooks/handle.ts`
- Contains: `+server.ts` API endpoints, `+page.server.ts` server loaders, `+layout.svelte`/`+layout.ts` layouts.
- Depends on: `$lib/server/auth`, `$lib/server/database`, `$lib/server/config`, `$lib/server/requestContext`.
- Used by: Browser; SvelteKit dev/preview/adapter-node runtime.

**Server services (`src/lib/server/`):**
- Purpose: All Node-only logic (DB, auth, models, generation, MCP, router, billing).
- Location: `src/lib/server/`
- Contains: Database singleton, model registry, OpenAI endpoint factory, text-generation pipeline, MCP registry/tools, Arch-Router, metrics, file uploads, billing.
- Depends on: MongoDB driver, `openai`, `@modelcontextprotocol/sdk`, `@huggingface/inference`, `@clerk/backend`, Stripe, Pino.
- Used by: Route handlers under `src/routes/`.

**Shared types (`src/lib/types/`):**
- Purpose: TypeScript interfaces shared by client and server.
- Location: `src/lib/types/`
- Contains: `Conversation`, `Message`, `MessageUpdate`, `Model`, `Settings`, `User`, `Session`, `Tool`, `Assistant`, `BillingEntitlement`, etc.
- Used by: server (DB collection generics, validation), client (component props, store shapes).

**Client utilities and stores (`src/lib/utils/`, `src/lib/stores/`):**
- Purpose: Browser-side helpers and reactive state.
- Location: `src/lib/utils/`, `src/lib/stores/`
- Contains: Markdown rendering, message-tree manipulation (`utils/tree/`), streamed-update parsing, settings store, error toast store, MCP server preferences, public-config rune store (`PublicConfig.svelte.ts`).
- Used by: Components and `+page.svelte` files.

**UI components (`src/lib/components/`):**
- Purpose: Svelte 5 components, organized by feature.
- Location: `src/lib/components/`
- Contains: `chat/` (composer, message renderer, model picker, voice recorder, browser panel), `mcp/` (server manager UI), `voice/` (waveform), `icons/` (custom SVG-Svelte icons), top-level modals and nav.

**Cross-request infrastructure:**
- Singletons: `Database`, `MetricsServer`, `AbortRegistry`, `AbortedGenerations`, `adminTokenManager`, `ConfigManager`.
- Concern: Boot-time initialization in `src/lib/server/hooks/init.ts`; teardown via `onExit` in `src/lib/server/exitHandler.ts`.

## Data Flow

**Chat send (canonical path):**
1. User submits message in `ChatInput.svelte` inside `ChatWindow.svelte`; the page (`src/routes/conversation/[id]/+page.svelte`) POSTs `multipart/form-data` to `/conversation/[id]`.
2. `src/routes/conversation/[id]/+server.ts` validates auth, fetches the conversation, applies rate limits (`messageEvents` collection + `usageLimits`), uploads files via `$lib/server/files/uploadFile`, then mutates the conversation message tree (`addChildren`/`addSibling` from `src/lib/utils/tree/`).
3. Builds `TextGenerationContext` (`src/lib/server/textGeneration/types.ts`) including the resolved `Endpoint`, an `AbortController` registered with `AbortRegistry`, and per-user setting overrides (`forceMultimodal`, `forceTools`, `provider`).
4. Calls `textGeneration(ctx)` (`src/lib/server/textGeneration/index.ts`) which merges three async generators: title generation, the main generation pipeline, and a `keepAlive` heartbeat.
5. Main pipeline preprocesses messages (`endpoints/preprocessMessages.ts`), then attempts MCP tool flow (`textGeneration/mcp/runMcpFlow.ts`); on `not_applicable` or recoverable failure it falls back to plain `generate(...)`.
6. `generate(...)` invokes the resolved `Endpoint` (the OpenAI client wrapper). Router models hit `makeRouterEndpoint` (`src/lib/server/router/endpoint.ts`), which calls `archSelectRoute` then dispatches to the chosen sub-model.
7. Each yielded `MessageUpdate` is enqueued to the response stream and accumulated onto `messageToWriteTo` (content, reasoning buffer, tool updates, file refs, router metadata).
8. On stream end / abort, `persistConversation()` writes the final message tree (with stream tokens compressed to length markers) to `collections.conversations`.

**State Management:**
- Server state: MongoDB documents (conversations, settings, sessions, etc.) with secondary-preferred reads on heavy collections; per-request context kept in `AsyncLocalStorage` (`src/lib/server/requestContext.ts`).
- Client state: Svelte 5 runes inside components; legacy stores in `src/lib/stores/` for cross-component concerns (errors, settings, MCP servers, share modal, background generations, pending message hand-off between `+page.svelte` and conversation page).
- Hydration: `+layout.ts` fetches user, settings, models, feature flags, conversation list in parallel via the typed `APIClient` (`src/lib/APIClient.ts`); `superjson` preserves `ObjectId`s on the wire.

## Key Abstractions

**`Endpoint` (function type):**
- Purpose: Uniform LLM streaming interface. `(EndpointParameters) => AsyncGenerator<TextGenerationStreamOutputSimplified>`.
- Examples: `src/lib/server/endpoints/endpoints.ts`, `src/lib/server/endpoints/openai/endpointOai.ts`, `src/lib/server/router/endpoint.ts`.
- Pattern: Strategy + factory. The model registry attaches a `getEndpoint()` factory that returns an `Endpoint` per model.

**`MessageUpdate` (discriminated union):**
- Purpose: Single shape for all streamed events (Status, Title, Tool, Stream, File, FinalAnswer, Reasoning, RouterMetadata, Browser).
- Examples: `src/lib/types/MessageUpdate.ts`; emitted by every generator under `src/lib/server/textGeneration/`.
- Pattern: Tagged union consumed both server-side (persistence) and client-side (`src/lib/utils/messageUpdates.ts`).

**Conversation message tree:**
- Purpose: Conversation history is a tree, not a list, to support edits and retries with sibling branches.
- Examples: `src/lib/utils/tree/{addChildren,addSibling,buildSubtree,convertLegacyConversation}.ts`, `src/lib/utils/tree/tree.d.ts`.
- Pattern: Each `Message` carries `ancestors[]` and `children[]`; `rootMessageId` anchors the tree on `Conversation`.

**Singleton `Database`:**
- Purpose: One MongoClient per process; provides typed collections.
- Example: `src/lib/server/database.ts` (`Database`, `collections`, `ready`, `getCollectionsEarly`).
- Pattern: Lazy-init singleton; falls back to `MongoMemoryServer` when `MONGODB_URL` is unset.

**`ConfigManager` (`src/lib/server/config.ts`):**
- Purpose: Merge `$env/dynamic/private` + `$env/dynamic/public` + DB-overridden keys; exposes `config.get(key)` and `config.isHuggingChat`.
- Pattern: Singleton with periodic `checkForUpdates()` driven by a `semaphores` collection.

**Arch-Router policy:**
- Purpose: Map free-text intents to a "route" (named cluster) and pick the primary/fallback model.
- Examples: `src/lib/server/router/{arch,policy,endpoint,toolsRoute,multimodal}.ts`; routes JSON at `LLM_ROUTER_ROUTES_PATH`.
- Pattern: Policy-as-data; bypass shortcuts when multimodal or active tool selection is detected.

**MCP integration:**
- Purpose: Expose MCP-server tools as OpenAI function tools.
- Examples: `src/lib/server/mcp/{registry,httpClient,clientPool,tools,hf}.ts`, `src/lib/server/textGeneration/mcp/{runMcpFlow,routerResolution,toolInvocation,fileRefs}.ts`.
- Pattern: Cached per-server tool listing (TTL), client pool, sanitized tool names, optional Steel browser session for browsing tools.

## Entry Points

**`src/hooks.server.ts`:**
- Location: `src/hooks.server.ts`
- Triggers: SvelteKit boot (`init`) and every request (`handle`, `handleError`, `handleFetch`).
- Responsibilities: Delegates to `$lib/server/hooks/{init,handle,error,fetch}.ts` once `building` flag is false.

**`src/lib/server/hooks/init.ts` (`initServer`):**
- Triggers: SvelteKit `init` lifecycle (once per process).
- Responsibilities: Wait for `ready` (DB), warm up `MetricsServer`, run pending DB migrations (`src/lib/migrations/migrations.ts`), kick off `refreshConversationStats`, load MCP servers, instantiate `AbortedGenerations`, print admin token.

**`src/lib/server/hooks/handle.ts` (`handleRequest`):**
- Triggers: Every HTTP request.
- Responsibilities: Wrap request in `runWithRequestContext`, gate `/admin/*` behind `ADMIN_API_SECRET`, run `authenticateRequest`, perform CSRF check on POST, refresh session cookie, attach `Access-Control-Allow-*` headers for `/api/*`, append `Content-Security-Policy` frame-ancestors, replace `%gaId%` token in `app.html`.

**`src/routes/conversation/[id]/+server.ts`:**
- Triggers: `POST` (chat send), `DELETE` (delete), `PATCH` (rename / model swap).
- Responsibilities: Drives the entire generation pipeline; returns a `ReadableStream` of newline-delimited `MessageUpdate` JSON.

**`src/routes/conversation/+server.ts`:**
- Triggers: `POST /conversation`.
- Responsibilities: Create a conversation document (or import from a shared link) and return its `conversationId`.

**`src/routes/api/v2/**`:**
- Triggers: REST clients (the SvelteKit app itself uses `APIClient`, third-party scripts can call directly).
- Responsibilities: Models, conversations CRUD, billing (Stripe checkout/portal/webhook), feature flags, public config, user settings, debug endpoints.

## Error Handling

**Strategy:** SvelteKit `error()` helper for HTTP errors at route boundaries; structured Pino logs everywhere else. Stream errors are funneled through the streamed `MessageUpdate` (Status=Error) so the client can render them inline rather than losing the connection.

**Patterns:**
- `handleServerError` (`src/lib/server/hooks/error.ts`) generates an `errorId`, logs full context, returns a sanitized `App.Error` (`{ message, errorId }`).
- Generation pipeline distinguishes abort (user-initiated) from policy errors (HTTP 400/401/402/403) and from transient errors that justify falling back from MCP to plain generation (`src/lib/server/textGeneration/index.ts`).
- Upstream OpenAI/router errors are normalized by `extractUpstreamError` in `src/lib/server/router/endpoint.ts` to preserve the original status code through to the client.
- Client side: `src/lib/stores/errors.ts` is a writable store rendered as a toast in `+layout.svelte`.

## Cross-Cutting Concerns

**Logging:** Pino (`src/lib/server/logger.ts`); the `mixin` injects `request_id`, `url`, `ip`, `user`, `status_code` from the AsyncLocalStorage request context (`src/lib/server/requestContext.ts`). Pretty-printed in dev.

**Validation:** Zod schemas at every trust boundary - request bodies in `+server.ts` route handlers, model config (`src/lib/server/models.ts`), endpoint params (`src/lib/server/endpoints/openai/endpointOai.ts`).

**Authentication:**
- `src/lib/server/auth.ts` orchestrates Clerk-backed and legacy OIDC sessions; falls back to anonymous `sessionId` cookie.
- `src/lib/server/clerk.ts` integrates `@clerk/backend` for token validation and user-profile mapping.
- Route helpers `requireAuth` / `requireAdmin` (`src/lib/server/api/utils/requireAuth.ts`) keep individual handlers terse.
- `App.Locals` is augmented in `src/app.d.ts` with `sessionId`, `user`, `isAdmin`, `token`, `clerkAuth`, `billingOrganization`, `opencodeApiKey`.

**Authorization for resources:** `authCondition(locals)` in `src/lib/server/auth.ts` returns the MongoDB filter (`{userId}` or `{sessionId}`) used everywhere a resource is fetched.

**CSRF / CORS:** `handleRequest` enforces matching origins for non-JSON POSTs and sets permissive CORS only for `/api/*`. SvelteKit `csrf.checkOrigin` is disabled because origin checking happens in the hook.

**Rate limiting:** `messageEvents` collection with TTL index plus `src/lib/server/usageLimits.ts` thresholds (per-minute messages, per-conversation message count, message length).

**Metrics:** Prom-client exposes `/metrics` (`src/routes/metrics/+server.ts`) when `METRICS_ENABLED=true`. The chat handler records `tokenCountTotal`, `timeToFirstToken`, `timePerOutputToken`, `latency`, `messagesTotal` per model.

**Migrations:** Boot-time migration runner (`src/lib/migrations/migrations.ts`) executes routines in `src/lib/migrations/routines/` once per process, guarded by a Mongo semaphore (`src/lib/migrations/lock.ts`).

**Background jobs:** `src/lib/jobs/refresh-conversation-stats.ts` runs aggregation queries on `conversations` to backfill `conversations.stats`.

**Abort propagation:** `AbortRegistry` registers per-conversation `AbortController`s so `/conversation/[id]/stop-generating` can interrupt active streams; complemented by the DB-polled `AbortedGenerations` cache for cross-process cases.

**Wire format:** `superjson` round-trips MongoDB `ObjectId`s; the chat stream uses raw JSONL with optional 4 KiB null-padding after `FinalAnswer` to defeat packet-length side channels.

---
*Architecture analysis: 2026-04-25*
