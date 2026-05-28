# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See `README.md` for setup instructions and `ARCHITECTURE.md` for a full system overview.

## Commands

```bash
pnpm dev             # Start dev server (http://localhost:5173, proxies /api → localhost:3903)
pnpm build           # TypeScript check + Vite production build
pnpm generate-api    # Regenerate src/api/garage.d.ts from the OpenAPI spec
```

## Architecture

**Stack**: React 19 + Vite 6 + TypeScript (strict), react-router-dom v7, TanStack Query v5, shadcn/ui components, Tailwind CSS v3.

**API Layer** (`src/api/`)
- `garage.d.ts` — generated types from `docs/garage-admin-v2.json` (Garage admin API v2, OpenAPI 3.1). Re-run `pnpm generate-api` if the spec changes.
- `client.ts` — `createGarageClient()` wraps `openapi-fetch` with the stored bearer token and base URL. Call `refreshClient()` after the user saves new credentials. Token + base URL are persisted in localStorage (base URL is trailing-slash-normalized on read). Requests carry a 30s timeout via `AbortSignal.timeout`.
  - **`unwrap(call)`** — wrap every `getClient().GET/POST(...)` in this. It returns `data` or throws an `ApiError` with a readable message (extracts Garage's `{ code, message }`, maps 401/403 → "check your admin token", reports network failures and timeouts). Hooks should not hand-roll `if (error) throw …` anymore.
  - **`ApiError`** carries `status`; `App.tsx`'s react-query `retry` skips 4xx so bad tokens/requests aren't retried.
  - **`testConnection(baseUrl, token)`** — pings `GetClusterHealth` with a throwaway client (doesn't touch the live one); backs the Settings "Test Connection" button.

**API shape notes** (the generated types enforce this):
- Several endpoints need `params: { query: { node: "*" } }` — `ListBlockErrors`, `ListWorkers`, `LaunchRepairOperation`, `CreateMetadataSnapshot`, `GetBlockInfo`, `RetryBlockResync`, `PurgeBlocks`, `SetWorkerVariable`.
- `ListBlockErrors` / `ListWorkers` return `MultiResponse_Local…` — an `{ error: { nodeId: string }, success: { nodeId: T[] } }` shape, not a flat array. Flatten with `Object.values(data.success)`.
- `DeleteBucket`, `DeleteKey`, `DeleteAdminToken` use `params.query.id` — no request body.
- `PurgeBlocks` body is `string[]` (block hashes directly).
- `RetryBlockResync` body is `{ blockHashes: string[] }` or `{ all: boolean }`.
- `CreateAdminToken` returns `secretToken` (only shown once); `ListAdminTokens` items have `id` (token prefix), not the full token.

**Routing** (`src/App.tsx`)
All routes live under `<AppLayout>` (sidebar + outlet):
- `/cluster` → `ClusterPage` — health, node table, per-node storage bars (auto-refresh 15s)
- `/layout` → `LayoutPage` — current roles, staged changes, apply/revert/preview, history
- `/buckets` → `BucketsPage` — list, create (global alias optional), delete
- `/keys` → `KeysPage` — list, create (shows secret once), delete
- `/tokens` → `TokensPage` — list, create (expiry optional), revoke
- `/workers` → `WorkersPage` — worker table, maintenance ops (repair, cleanup uploads, snapshot), set variables
- `/blocks` → `BlocksPage` — block errors with retry/purge, inspect object, block info lookup
- `/settings` → `SettingsPage` — base URL and admin token config, with a Test Connection button and config import/export

**UI Components** (`src/components/ui/`)
Hand-written shadcn/ui-style components (not installed from CLI). CSS variables in `src/index.css` drive the theme. `src/lib/utils.ts` exports `cn()`, `formatBytes()`, and `truncate()`.

**S3 Layer** (`src/api/s3client.ts`)
- `@aws-sdk/client-s3` with `forcePathStyle: true` (required for Garage)
- Relative endpoint paths (e.g. `/s3`) are resolved against `window.location.origin` before passing to the SDK
- `s3Configured()` returns true when key ID + secret are set (endpoint is optional — defaults to `/s3` proxied)
- `@aws-sdk/lib-storage` `Upload` handles multipart for files > 5 MB

**Dev proxy**: Vite proxies `/api/*` → Garage admin API (:3903). S3 is accessed directly from the browser (no proxy — AWS SigV4 signing is incompatible with path-rewriting proxies). In production nginx handles the admin API proxy via `nginx.conf.template`.
