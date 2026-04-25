# File Map

**Analysis Date:** 2026-04-25

## Top-Level Runtime Surface

- `src/hooks.server.ts` — SvelteKit server hook entrypoint.
- `src/hooks.ts` — shared hook glue.
- `src/app.html` — HTML shell; analytics token replacement happens here.
- `src/app.d.ts` / `src/ambient.d.ts` — app and module typing.

## Route Surface

### App pages
- `src/routes/+page.svelte` — home page.
- `src/routes/+layout.svelte` / `src/routes/+layout.ts` — global shell, initial data loading.
- `src/routes/+error.svelte` — global error UI.
- `src/routes/privacy/+page.svelte` — privacy page.

### Conversation flow
- `src/routes/conversation/+server.ts` — create/import conversation.
- `src/routes/conversation/[id]/+page.svelte` — main chat page UI.
- `src/routes/conversation/[id]/+page.ts` — chat page loader.
- `src/routes/conversation/[id]/+server.ts` — POST chat send; core streaming endpoint.
- `src/routes/conversation/[id]/stop-generating/+server.ts` — abort active generation.
- `src/routes/conversation/[id]/share/+server.ts` — share conversation.
- `src/routes/conversation/[id]/output/[sha256]/+server.ts` — fetch generated output artifact.
- `src/routes/r/[id]/+page.ts` — shared conversation loader.

### Models and settings
- `src/routes/models/+page.svelte` — model listing UI.
- `src/routes/models/[...model]/+page.svelte` / `+page.ts` — model detail page.
- `src/routes/models/[...model]/thumbnail.png/+server.ts` — OG thumbnail generation.
- `src/routes/models/[...model]/thumbnail.png/ModelThumbnail.svelte` — thumbnail component.
- `src/routes/settings/+layout.svelte` — settings shell.
- `src/routes/settings/(nav)/+layout.svelte` / `+layout.ts` — settings nav + data.
- `src/routes/settings/(nav)/+page.ts` / `+server.ts` — settings root.
- `src/routes/settings/(nav)/application/+page.svelte` — app settings UI.
- `src/routes/settings/(nav)/[...model]/+page.svelte` / `+page.ts` — model settings UI.

### Auth and session
- `src/routes/login/+server.ts` — login start.
- `src/routes/login/callback/+server.ts` — login callback.
- `src/routes/login/callback/updateUser.ts` — callback user sync.
- `src/routes/logout/+server.ts` — logout.
- `src/routes/.well-known/oauth-cimd/+server.ts` — legacy OIDC metadata.

### API surface (legacy)
- `src/routes/api/conversation/[id]/+server.ts`
- `src/routes/api/conversations/+server.ts`
- `src/routes/api/models/+server.ts`
- `src/routes/api/user/+server.ts`
- `src/routes/api/user/validate-token/+server.ts`
- `src/routes/api/transcribe/+server.ts`
- `src/routes/api/fetch-url/+server.ts`
- `src/routes/api/mcp/health/+server.ts`
- `src/routes/api/mcp/servers/+server.ts`

### API surface (v2)
- `src/routes/api/v2/conversations/+server.ts` — list/create conversations.
- `src/routes/api/v2/conversations/[id]/+server.ts` — conversation CRUD.
- `src/routes/api/v2/conversations/import-share/+server.ts` — import shared conversation.
- `src/routes/api/v2/models/+server.ts` — models registry.
- `src/routes/api/v2/models/[namespace]/+server.ts` — namespaced models.
- `src/routes/api/v2/models/old/+server.ts` — legacy models endpoint.
- `src/routes/api/v2/models/refresh/+server.ts` — force refresh model registry.
- `src/routes/api/v2/user/+server.ts` — current user.
- `src/routes/api/v2/user/settings/+server.ts` — persisted settings.
- `src/routes/api/v2/user/reports/+server.ts` — reports.
- `src/routes/api/v2/user/billing-orgs/+server.ts` — billing orgs.
- `src/routes/api/v2/public-config/+server.ts` — public feature/config payload.
- `src/routes/api/v2/feature-flags/+server.ts` — flags.
- `src/routes/api/v2/export/+server.ts` — data export.
- `src/routes/api/v2/debug/config/+server.ts` / `refresh/+server.ts` — debug endpoints.
- `src/routes/api/v2/billing/checkout/+server.ts` — Stripe checkout.
- `src/routes/api/v2/billing/portal/+server.ts` — Stripe portal.
- `src/routes/api/v2/billing/webhook/+server.ts` — Stripe webhook.

### Operational / admin
- `src/routes/healthcheck/+server.ts` — liveness.
- `src/routes/metrics/+server.ts` — Prometheus scrape endpoint.
- `src/routes/admin/export/+server.ts` — admin export.
- `src/routes/admin/stats/compute/+server.ts` — admin stats compute.
- `src/routes/__debug/openai/+server.ts` — debug endpoint for OpenAI path.

## Core Server Subsystems

### Request lifecycle and auth
- `src/lib/server/hooks/init.ts` — boot-time init: DB ready, migrations, metrics, MCP warmup.
- `src/lib/server/hooks/handle.ts` — request handling, auth, CSRF, CORS, CSP.
- `src/lib/server/hooks/error.ts` — structured server error shaping.
- `src/lib/server/hooks/fetch.ts` — server fetch hook.
- `src/lib/server/auth.ts` — auth/session resolution and ownership filters.
- `src/lib/server/clerk.ts` — Clerk integration.
- `src/lib/server/syncAuthenticatedUser.ts` — user sync after auth.
- `src/lib/server/requestContext.ts` — AsyncLocalStorage request context.
- `src/lib/server/adminToken.ts` — admin token management.

### Persistence and jobs
- `src/lib/server/database.ts` — MongoDB singleton, typed collections, GridFS.
- `src/lib/jobs/refresh-conversation-stats.ts` — background stat refresh.
- `src/lib/migrations/**` — boot-time migration framework and routines.

### Model registry and routing
- `src/lib/server/models.ts` — canonical model registry assembly.
- `src/lib/server/router/arch.ts` — Arch router call.
- `src/lib/server/router/policy.ts` — route selection policy.
- `src/lib/server/router/endpoint.ts` — router-backed endpoint wrapper.
- `src/lib/server/router/multimodal.ts` — multimodal route shortcuts.
- `src/lib/server/router/toolsRoute.ts` — tools-capable route selection.
- `src/lib/server/router/types.ts` — router types.

### LLM endpoint adapters
- `src/lib/server/endpoints/endpoints.ts` — endpoint contracts.
- `src/lib/server/endpoints/openai/endpointOai.ts` — OpenAI-compatible upstream client.
- `src/lib/server/endpoints/openai/openAIChatToTextGenerationStream.ts` — stream adapter.
- `src/lib/server/endpoints/openai/openAICompletionToTextGenerationStream.ts` — completion adapter.
- `src/lib/server/endpoints/preprocessMessages.ts` — message normalization before generation.
- `src/lib/server/endpoints/images.ts` — image/multimodal helpers.
- `src/lib/server/generateFromDefaultEndpoint.ts` — default generation entry.

### Text generation pipeline
- `src/lib/server/textGeneration/index.ts` — top-level generation orchestration.
- `src/lib/server/textGeneration/generate.ts` — plain generation path.
- `src/lib/server/textGeneration/types.ts` — context and stream types.
- `src/lib/server/textGeneration/reasoning.ts` — reasoning handling.
- `src/lib/server/textGeneration/title.ts` / `titleSanitizer.ts` — title generation.
- `src/lib/server/textGeneration/utils/prepareFiles.ts` — file prep.
- `src/lib/server/textGeneration/utils/routing.ts` — route prep.
- `src/lib/server/textGeneration/utils/toolPrompt.ts` — tool prompting.

### MCP and browser
- `src/lib/server/mcp/registry.ts` — MCP server registry.
- `src/lib/server/mcp/clientPool.ts` — pooled MCP clients.
- `src/lib/server/mcp/httpClient.ts` — HTTP transport helpers.
- `src/lib/server/mcp/tools.ts` — tool listing/translation.
- `src/lib/server/mcp/hf.ts` — HuggingFace MCP helpers.
- `src/lib/server/textGeneration/mcp/runMcpFlow.ts` — MCP tool-call flow inside generation.
- `src/lib/server/textGeneration/mcp/toolInvocation.ts` — tool execution and update emission.
- `src/lib/server/textGeneration/mcp/routerResolution.ts` — model/tool routing decisions.
- `src/lib/server/textGeneration/mcp/fileRefs.ts` — file refs for MCP outputs.
- `src/lib/server/browser/steel.ts` — Steel browser session control and debug URL rewriting.

### Infra helpers
- `src/lib/server/logger.ts` — pino logger.
- `src/lib/server/metrics.ts` — Prometheus metrics.
- `src/lib/server/urlSafety.ts` / `isURLLocal.ts` — SSRF guards.
- `src/lib/server/files/uploadFile.ts` / `downloadFile.ts` — GridFS file handling.
- `src/lib/server/abortRegistry.ts` / `abortedGenerations.ts` — abort tracking.
- `src/lib/server/usageLimits.ts` — rate and quota checks.
- `src/lib/server/config.ts` — env + DB-backed config.
- `src/lib/server/conversation.ts` — conversation-level server helpers.
- `src/lib/server/findRepoRoot.ts` / `exitHandler.ts` / `apiToken.ts` — misc server support.

## Core Client/UI Subsystems

### Chat UI
- `src/lib/components/chat/ChatWindow.svelte` — top-level conversation UI shell.
- `src/lib/components/chat/ChatInput.svelte` — composer, uploads, send controls.
- `src/lib/components/chat/ChatMessage.svelte` — single message renderer.
- `src/lib/components/chat/MarkdownRenderer.svelte` / `MarkdownBlock.svelte` — formatted content.
- `src/lib/components/chat/ChatModelPicker.svelte` / `ModelSwitch.svelte` — model selection.
- `src/lib/components/chat/BrowserPanel.svelte` — embedded Steel browser panel.
- `src/lib/components/chat/ToolUpdate.svelte` — tool progress render.
- `src/lib/components/chat/FileDropzone.svelte`, `UploadedFile.svelte`, `UrlFetchModal.svelte`, `VoiceRecorder.svelte` — input enrichments.

### Shared UI
- `src/lib/components/NavMenu.svelte`, `NavConversationItem.svelte`, `MobileNav.svelte`, `ExpandNavigation.svelte` — navigation.
- `src/lib/components/Modal.svelte`, `Portal.svelte`, `Toast.svelte`, `Tooltip.svelte` — UI primitives.
- `src/lib/components/ShareConversationModal.svelte`, `DeleteConversationModal.svelte`, `EditConversationModal.svelte`, `SystemPromptModal.svelte`, `SubscribeModal.svelte`, `WelcomeModal.svelte` — modal flows.
- `src/lib/components/ScrollToBottomBtn.svelte`, `ScrollToPreviousBtn.svelte`, `RetryBtn.svelte`, `StopGeneratingBtn.svelte` — conversation controls.
- `src/lib/components/mcp/**` — MCP server management UI.
- `src/lib/components/players/AudioPlayer.svelte` and `voice/AudioWaveform.svelte` — media playback.

## Shared Domain Types

- `src/lib/types/Conversation.ts` — conversation tree root.
- `src/lib/types/Message.ts` — message node.
- `src/lib/types/MessageUpdate.ts` — streamed update union.
- `src/lib/types/Model.ts` — model descriptor.
- `src/lib/types/Settings.ts` — persisted user settings.
- `src/lib/types/User.ts` / `Session.ts` — identity/session.
- `src/lib/types/Tool.ts` — MCP/tool metadata.
- `src/lib/types/Assistant.ts`, `Report.ts`, `BillingEntitlement.ts`, `ConversationStats.ts` — secondary domains.

## Supporting Utilities and Stores

- `src/lib/utils/tree/**` — conversation tree mutation and traversal.
- `src/lib/utils/messageUpdates.ts` — client parsing/application of streamed updates.
- `src/lib/utils/mergeAsyncGenerators.ts` — stream composition primitive.
- `src/lib/utils/marked.ts`, `parseBlocks.ts`, `parseIncompleteMarkdown.ts` — content parsing.
- `src/lib/utils/models.ts`, `mcpValidation.ts`, `toolProgress.ts`, `generationState.ts` — domain helpers.
- `src/lib/stores/settings.ts`, `mcpServers.ts`, `errors.ts`, `pendingMessage.ts`, `backgroundGenerations*.ts`, `shareModal.ts`, `loading.ts`, `titleUpdate.ts` — reactive cross-component state.

## Tests and verification hotspots

- Server/API tests live under `src/lib/server/**/__tests__` and `*.spec.ts` files.
- Chat markdown component test: `src/lib/components/chat/MarkdownRenderer.svelte.test.ts`.
- MCP flow regression coverage: `src/lib/server/textGeneration/mcp/runMcpFlow.spec.ts`.
- Routing coverage: `src/lib/server/router/toolsRoute.spec.ts`.
- Auth/billing/url safety/tree helpers each have focused spec files alongside implementation.

## Current integration seams relevant to active work

- Steel browser integration lives at the seam between `src/lib/server/browser/steel.ts`, `src/lib/server/textGeneration/mcp/runMcpFlow.ts`, `src/lib/types/MessageUpdate.ts`, `src/routes/conversation/[id]/+page.svelte`, and `src/lib/components/chat/BrowserPanel.svelte`.
- Model wiring lives at the seam between env/config (`.env*`, chart env files), `src/lib/server/models.ts`, and `src/lib/components/chat/ChatModelPicker.svelte`.
- Composer/layout work centers on `src/lib/components/chat/ChatWindow.svelte`, `ChatInput.svelte`, and the conversation page wrapper.

---
*File map generated for v1 GSD codebase documentation.*
