# Repository Guidelines

## Project Overview

Chat UI is a SvelteKit 2 application that provides a chat interface for LLMs. It powers [HuggingChat](https://huggingface.co/chat) and is designed to work with any OpenAI-compatible API endpoint. The app supports streaming conversations, multimodal input, tool calling via MCP (Model Context Protocol), browser automation, server-side LLM routing, and Stripe billing integration.

Key capabilities:
- Conversational UI with streaming responses, message branching, and sharing
- Model discovery from OpenAI-compatible `/models` endpoints
- Server-side smart routing via an Arch router model (virtual "Omni" model)
- MCP tool execution with configurable servers
- Browser automation via Steel SDK
- Clerk authentication with MongoDB-backed sessions
- Stripe paywall for premium features

## Architecture & Data Flow

### High-level Structure

The app follows SvelteKit's file-based routing with a clear server/client boundary:

```
Browser → SvelteKit SSR/CSR → Server Hooks → Auth → API Routes/Page Loaders → MongoDB
                                               ↓
                                         LLM Endpoints (OpenAI-compatible)
                                               ↓
                                         Streaming Response (SSE/Generator)
```

### Request Lifecycle

1. **Entry**: `src/hooks.server.ts` → delegates to `src/lib/server/hooks/handle.ts`
2. **Auth**: `authenticateRequest()` in `src/lib/server/auth.ts` handles Clerk JWT, trusted headers, and anonymous sessions
3. **CSRF/CORS**: Handled in the main handle function; API routes get CORS headers dynamically
4. **Resolve**: Request reaches page loaders (`+page.ts`) or API handlers (`+server.ts`)
5. **Database**: All DB access goes through the `Database` singleton (`src/lib/server/database.ts`) exposing typed MongoDB collections

### Key Modules

| Module | Purpose |
|--------|---------|
| `src/lib/server/auth.ts` | Authentication: Clerk integration, session cookies, `authCondition()` helper |
| `src/lib/server/database.ts` | MongoDB singleton with typed collections + index initialization |
| `src/lib/server/config.ts` | Config manager merging env vars with DB-overridden values |
| `src/lib/server/endpoints/` | LLM endpoint abstractions (currently OpenAI-compatible) |
| `src/lib/server/textGeneration/` | Streaming generation logic, reasoning extraction, abort handling |
| `src/lib/server/mcp/` | MCP client pool, tool registry, HTTP client |
| `src/lib/server/router/` | LLM router (Arch) integration: routing, multimodal, tools |
| `src/lib/server/billing/` | Stripe integration, entitlements, paywall gating |
| `src/lib/server/browser/` | Steel SDK browser automation, session store |
| `src/lib/server/metrics.ts` | Prometheus metrics server (standalone on separate port) |
| `src/lib/APIClient.ts` | Typed client for internal API v2 (browser + SSR safe) |

### Data Flow Patterns

- **Page data**: `+page.ts` loaders call `useAPIClient()` which hits `/api/v2/*` endpoints
- **Streaming**: Text generation uses async generators yielding `MessageUpdate` objects; the UI consumes these via `EventSource` or direct generator iteration
- **State sync**: Settings use a writable store (`src/lib/stores/settings.ts`) that POSTs to `/settings` with 300ms debounce
- **Public config**: Server-side env vars prefixed with `PUBLIC_` are transported to the client via SvelteKit's `transport` mechanism (`src/hooks.ts`) using superjson

## Key Directories

```
src/
  app.html                 # HTML template with theme/dark-mode inline script
  hooks.server.ts          # Server hook entry point
  hooks.ts                 # Client transport registration
  +layout.svelte           # Root layout: nav, settings context, error toasts
  +page.svelte             # Home page: ChatWindow for new conversations
  routes/
    conversation/            # Conversation creation (+server.ts) + chat page ([id]/)
    settings/                # Settings pages (group layout)
    admin/                   # Admin API routes (export, stats)
    api/
      v2/                    # REST API v2 (conversations, user, models, billing, etc.)
      conversation/          # Legacy streaming endpoint
      mcp/                   # MCP health/status
    login/                   # Login/logout routes
    models/                  # Model listing page
    r/                       # Shared conversation viewing
  lib/
    components/
      chat/                  # Chat UI: ChatWindow, ChatMessage, ChatInput, etc.
      mcp/                   # MCP server UI components
      icons/                 # Custom icon components
      voice/                 # Voice recording components
      players/               # Audio/video players
    server/
      hooks/                 # handle, error, fetch, init
      endpoints/             # LLM endpoint implementations
      textGeneration/        # Generate, title, reasoning
      mcp/                   # MCP integration
      router/                # LLM router
      billing/               # Stripe
      browser/               # Steel automation
      files/                 # GridFS upload/download
    stores/                  # Svelte stores (settings, errors, loading, etc.)
    types/                   # TypeScript domain types
    utils/                   # Shared utilities
    workers/                 # Web workers (markdown parsing)
    jobs/                    # Background job scripts
    migrations/              # DB migration routines
    constants/               # App constants (pagination, examples, etc.)
    actions/                 # Svelte actions (snapScrollToBottom)
services/
  image-gen-mcp/             # Standalone MCP service for image generation
  music-gen-mcp/             # Standalone MCP service for music generation
scripts/
  setups/                    # Vitest setup files
  config.ts                  # Config management script
  populate.ts                # DB seeding script
  updateLocalEnv.ts          # Env file management
docs/                        # Documentation
db/                          # Embedded MongoDB data (local dev)
```

## Development Commands

```bash
# Install dependencies
npm install

# Dev server (port 5173)
npm run dev

# Production build
npm run build

# Static build (uses adapter-static)
npm run build:static

# Preview production build
npm run preview

# Type check
npm run check

# Type check watch mode
npm run check:watch

# Lint (Prettier + ESLint)
npm run lint

# Format code
npm run format

# Run tests
npm run test

# Config management
npm run config

# DB seeding
npm run populate
```

## Code Conventions & Common Patterns

### Formatting

- **Indentation**: Tabs (Prettier: `useTabs: true`)
- **Print width**: 100
- **Trailing commas**: ES5 style
- **Plugins**: `prettier-plugin-svelte`, `prettier-plugin-tailwindcss`
- All files formatted via `npm run format`

### TypeScript & Svelte

- **Strict mode** enabled (`tsconfig.json`)
- **Target**: ES2018
- **Svelte 5 runes** are the primary reactive pattern:
  ```svelte
  <script lang="ts">
    let { data } = $props();
    let count = $state(0);
    let doubled = $derived(count * 2);
    let input = $bindable("");

    $effect(() => {
      console.log(count);
    });
  </script>
  ```
- Some legacy Svelte stores remain (e.g., `settings.ts`, `errors.ts`, `loading.ts`). New code should prefer runes.
- **Path alias**: `$lib/*` maps to `src/lib/*`

### Naming Conventions

- **Files**: PascalCase for Svelte components (`ChatWindow.svelte`), camelCase for TS (`auth.ts`), kebab-case for directories (`text-generation/`)
- **Types**: PascalCase, often matching file name (`Conversation.ts` exports `Conversation`)
- **Server routes**: `+server.ts` for API endpoints, `+page.ts` for page loaders, `+page.svelte` for pages, `+layout.svelte` for layouts
- **Test files**: Co-located with source: `*.test.ts`, `*.spec.ts`, `*.ssr.test.ts`, `*.svelte.test.ts`

### Error Handling

- Server: Use SvelteKit's `error(status, message)` from `@sveltejs/kit`
- API responses: `superjsonResponse()` helper for consistent serialization
- Client: Errors surfaced via the `error` store (`src/lib/stores/errors.ts`) displayed as toast notifications
- Logging: Structured logging via `pino` (`src/lib/server/logger.ts`), with request context auto-attached

### Async Patterns

- **Streaming**: `async function* generate()` yields `MessageUpdate` objects consumed by the route handler
- **API client**: Promise-based with `useAPIClient()` returning typed endpoints
- **Database**: All MongoDB operations are async; use `await` consistently

### Auth & Authorization

- `authCondition(locals)` returns a MongoDB query filter scoped to the current user/session
- `requireAuth(locals)` throws 401 for unauthenticated API access
- Admin routes protected by `Bearer` token matching `ADMIN_API_SECRET`
- Clerk auth: JWT verified server-side; user synced to MongoDB on first request

### State Management

- **Svelte 5 runes** for local component state (`$state`, `$derived`, `$effect`)
- **Svelte stores** for shared/global state (`Writable` from `svelte/store`)
- **Context API** for dependency injection (e.g., `settings` store via `setContext`/`getContext`)
- **Server state**: Singletons with `static getInstance()` pattern (Database, MetricsServer, AbortedGenerations)

### Dependency Injection

- No framework-level DI; uses module-level singletons and Svelte context
- `collections` object from `database.ts` is the primary "injectable" for data access
- `config` proxy from `config.ts` provides env var access everywhere

### Tailwind & Styling

- Tailwind CSS 3.4 with JIT mode
- Custom gray palette (600-950) for dark mode
- Dark mode toggled via `.dark` class on `<html>`
- Component styles use Tailwind utility classes exclusively

### Import Aliases

```typescript
import { collections } from "$lib/server/database";
import type { Conversation } from "$lib/types/Conversation";
import { base } from "$app/paths";
import { page } from "$app/state";
import { dev } from "$app/environment";
```

## Important Files

| File | Purpose |
|------|---------|
| `svelte.config.js` | Adapter selection (node vs static), paths, CSP, CSRF |
| `vite.config.ts` | Vite plugins (SvelteKit, unplugin-icons, TTF loader), Vitest workspace config |
| `tsconfig.json` | TypeScript strict config, extends `.svelte-kit/tsconfig.json` |
| `tailwind.config.cjs` | Tailwind with custom colors, typography, scrollbar plugins |
| `src/app.d.ts` | App.Locals, App.Error type definitions |
| `src/app.html` | HTML template with dark-mode script and GA placeholder |
| `src/hooks.server.ts` | Server init, handle, error, fetch hooks |
| `src/lib/server/hooks/handle.ts` | Main request pipeline: auth, CSRF, CORS, session refresh |
| `src/lib/server/database.ts` | MongoDB connection, collections, index setup |
| `src/lib/server/config.ts` | Config manager: env vars + DB overrides + semaphore-based cache invalidation |
| `src/lib/server/auth.ts` | Clerk auth, session management, `authCondition()` |
| `src/lib/server/endpoints/endpoints.ts` | LLM endpoint registry and type definitions |
| `src/lib/server/textGeneration/generate.ts` | Core streaming generation with reasoning support |
| `src/lib/APIClient.ts` | Typed internal API client with superjson serialization |
| `.env` / `.env.local` | Environment configuration (see README for full list) |

## Runtime/Tooling Preferences

| Tool | Version/Spec |
|------|-------------|
| Runtime | Node.js 20+ (Docker: 22-alpine) |
| Package manager | npm 9.5.0 (enforced via `packageManager`) |
| Framework | SvelteKit 2.52+, Svelte 5.53+ |
| Bundler | Vite 6.3+ |
| TypeScript | 5.5+ (strict mode) |
| CSS | Tailwind CSS 3.4+, PostCSS, autoprefixer |
| DB | MongoDB 6/7 (or embedded via `mongodb-memory-server`) |
| Auth | Clerk (fallback: trusted header, anonymous sessions) |
| LLM | OpenAI-compatible APIs (Hugging Face router, local servers) |
| Icons | unplugin-icons (Iconify carbon, lucide, bi, eos-icons) |
| UI primitives | bits-ui |

### Constraints

- **Do not use Bun**: The project uses npm exclusively. `package-lock.json` is committed.
- **Do not modify `packageManager` field** without explicit approval.
- **ESM only**: `
"type": "module"` in `package.json`; all source is ESM.
- **No `any`**: ESLint rule `@typescript-eslint/no-explicit-any` is set to `error`.
- **No non-null assertions**: `@typescript-eslint/no-non-null-assertion` is `error`.
- **Server-only modules**: Files under `src/lib/server/` must not be imported by client code. SvelteKit enforces this at build time.
- **Environment access**: Public env vars use `$env/dynamic/public` or `$env/static/public`. Private env vars use `$env/dynamic/private` or `$env/static/private`. Never import private env in client-facing code.

## Testing & QA

### Frameworks

- **Vitest 3.x** with workspace configuration (see `vite.config.ts`)
- **Playwright** for browser automation (browser tests + Steel SDK integration)
- **mongodb-memory-server** for isolated test database

### Test Workspaces

| Workspace | Environment | File pattern | Setup |
|-----------|-------------|--------------|-------|
| `client` | Browser (Playwright Chromium) | `src/**/*.svelte.{test,spec}.{js,ts}` | `scripts/setups/vitest-setup-client.ts` |
| `ssr` | Node.js | `src/**/*.ssr.{test,spec}.{js,ts}` | None |
| `server` | Node.js | `src/**/*.{test,spec}.{js,ts}` (excludes svelte/ssr) | `scripts/setups/vitest-setup-server.ts` |

The **client** workspace is opt-in via `VITEST_BROWSER=true` because the browser harness can be flaky in CI.

### Test Patterns

```typescript
// Server test with mocked env and DB
import { vi, describe, it, expect } from "vitest";

vi.mock("$env/dynamic/public", () => ({ env: { PUBLIC_APP_NAME: "Test" } }));
vi.mock("$env/dynamic/private", () => ({ env: { MONGODB_URL: "..." } }));

// Component test (Svelte 5 runes)
import { render } from "vitest-browser-svelte";
import ChatMessage from "./ChatMessage.svelte";

// SSR test
import { load } from "./+page.ts";
```

### Running Tests

```bash
# All tests (server + ssr only, unless VITEST_BROWSER is set)
npm run test

# Client/browser tests
VITEST_BROWSER=true npm run test

# Specific workspace
npx vitest --project=server
```

### Coverage Expectations

- New utility functions should have unit tests.
- Server logic (auth, endpoints, text generation) should have tests where feasible.
- Component tests are encouraged for complex UI logic but are opt-in due to browser harness limitations.
- Tests use the in-memory MongoDB server; no external DB connection required.

### CI/CD

GitHub Actions workflows (`.github/workflows/`):

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `lint-and-test.yml` | PR, push to `main` | Lint, type check, tests, Docker build check |
| `build-docs.yml` | Scheduled | Documentation build |
| `build-image.yml` | PR, push | Docker image build and push |
| `deploy-dev.yml` | Push to `main` | Dev deployment |
| `deploy-prod.yml` | Release | Production deployment |
| `trufflehog.yml` | PR | Secret scanning |

Pre-commit hooks (`.husky/pre-commit`) run lint-staged: Prettier + ESLint on staged files.

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/config.ts` | Manage app config (env var manipulation) |
| `scripts/populate.ts` | Seed database with sample data |
| `scripts/updateLocalEnv.ts` | Update local `.env` files |
| `scripts/setups/vitest-setup-server.ts` | Server test setup: load `.env`, mock `$env/*`, start in-memory MongoDB |
| `scripts/setups/vitest-setup-client.ts` | Client test setup (currently empty stub) |

---

## Quick Reference for AI Assistants

When modifying this codebase:
1. Prefer **Svelte 5 runes** over legacy stores for new components.
2. Use **`$lib/server/*`** only in server contexts (`+server.ts`, `+page.server.ts`, hooks).
3. Use **`$lib/types/*`** for shared domain types between client and server.
4. Add new API endpoints under **`src/routes/api/v2/`** and expose them in **`src/lib/APIClient.ts`**.
5. Use **`collections.*`** for all database access; do not create new MongoDB connections.
6. Use **`config.*`** for environment variable access; do not use `process.env` directly.
7. Use **`error(status, message)`** from SvelteKit for HTTP errors in routes.
8. Use **`logger.info/warn/error()`** for server-side logging with structured data.
9. Run **`npm run check`** and **`npm run lint`** before committing.
10. Run **`npm run test`** to verify changes do not break existing tests.