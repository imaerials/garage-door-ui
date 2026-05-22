# Architecture

## Overview

```
Browser
  │
  ├── /api/*  ──► Vite (dev) / nginx (prod) ──► Garage Admin API :3903
  │
  └── S3 traffic, two modes:
        • Direct (default)         ──► Garage S3 API :3900  (SigV4-signed, needs per-bucket CORS)
        • Proxied /s3/* (opt-in)   ──► nginx ──► Garage S3 API :3900
                                       (GARAGE_S3_PROXY=true; unsigned/anonymous only)
```

The UI is a pure client-side SPA. The admin API is always reverse-proxied so it stays same-origin and avoids CORS. The S3 API is reached **directly** from the browser by default — SigV4 signing is incompatible with a path-rewriting reverse proxy, so proxying is opt-in and only useful for unsigned access.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript (strict) |
| Build | Vite 6 |
| Routing | react-router-dom v7 |
| Data fetching | TanStack Query v5 |
| Admin API client | openapi-fetch (type-safe, generated from OpenAPI spec) |
| S3 client | @aws-sdk/client-s3 + @aws-sdk/lib-storage |
| UI components | shadcn/ui (hand-written, not CLI-installed) |
| Styling | Tailwind CSS v3 + CSS variables for theming |
| Serving (prod) | nginx:alpine |

## Directory Structure

```
src/
├── api/
│   ├── garage.d.ts     # Generated from docs/garage-admin-v2.json — do not edit
│   ├── client.ts       # Admin API client (openapi-fetch + localStorage credentials)
│   └── s3client.ts     # S3 client (@aws-sdk, path-style, resolves relative endpoints)
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx     # Root layout: sidebar + <Outlet> + <Toaster>
│   │   ├── Sidebar.tsx       # Nav links
│   │   ├── PageHeader.tsx    # Sticky page title + optional action buttons
│   │   └── QueryState.tsx    # LoadingState / ErrorState shared components
│   └── ui/                   # shadcn/ui-style primitives (Button, Card, Dialog, etc.)
├── hooks/
│   └── use-toast.ts    # Toast state manager (singleton, used by <Toaster>)
├── lib/
│   └── utils.ts        # cn(), formatBytes(), truncate()
├── pages/
│   ├── cluster/        # Health tiles, node table, storage bars
│   ├── layout/         # Layout roles, staged changes, apply/revert, history
│   ├── buckets/        # Bucket list + BucketBrowserPage (S3 file browser)
│   ├── keys/           # Access key CRUD
│   ├── tokens/         # Admin token CRUD
│   ├── workers/        # Worker table, maintenance ops, variable setter
│   ├── blocks/         # Block errors, inspect object, block info
│   └── SettingsPage.tsx
└── App.tsx             # QueryClientProvider + BrowserRouter + routes
```

## Data Flow

### Admin API

```
Page component
  → useQuery / useMutation (TanStack Query)
    → getClient()  (src/api/client.ts)
      → openapi-fetch → /api/* → [proxy] → Garage :3903
```

`getClient()` returns a singleton recreated by `refreshClient()` whenever the user saves new credentials in Settings. Credentials are stored in `localStorage` (token, base URL), with fallback to `window.__GARAGE_CONFIG__` injected at container startup.

### S3 API

```
BucketBrowserPage
  → getS3Client()  (src/api/s3client.ts)
    → @aws-sdk S3Client → <endpoint from Settings> → Garage :3900
```

The S3 client uses `forcePathStyle: true` (required for Garage). The endpoint is whatever the user configured in **Settings → S3**:

- Direct mode (default): a full URL like `http://<garage-host>:3900`. Browser signs and sends to Garage directly; the bucket must have CORS configured.
- Proxied mode (`GARAGE_S3_PROXY=true`): a relative path like `/s3`, resolved against `window.location.origin` before being handed to the SDK. Same-origin, no CORS — but signatures only validate if Garage isn't enforcing them, so this is for anonymous/unsigned access only.

Credentials (key ID + secret) are stored in `localStorage`.

### Multipart Uploads

File uploads use `@aws-sdk/lib-storage`'s `Upload` class, which automatically switches to multipart upload for files over 5 MB and reports per-file progress via an event callback wired to component state.

## Configuration

Two layers of configuration, in priority order:

1. **localStorage** — set by the user via the Settings page. Takes priority.
2. **`window.__GARAGE_CONFIG__`** — injected at container startup by `docker-entrypoint.sh` from environment variables. Used as defaults when localStorage has no value. Currently carries `apiUrl`, `adminToken`, and `s3Proxy` (boolean flag mirroring `GARAGE_S3_PROXY`, available to the SPA if it ever needs to pre-fill the S3 endpoint).

In development, `public/config.js` provides empty defaults so the app boots without errors.

## Proxy Setup

### Development (Vite)

`vite.config.ts` proxies only the admin API:
- `/api/*` → `http://localhost:3903` (strips `/api` prefix)

S3 traffic is not proxied in dev — point **Settings → S3** at the Garage S3 port directly (e.g. `http://<garage-host>:3900`) and configure CORS on the bucket.

### Production (Docker / nginx)

`nginx.conf.template` is processed at container startup by `docker-entrypoint.sh` using `envsubst`:

- `/api/*` → `$GARAGE_UPSTREAM_URL` (default `http://garage:3903`) — always enabled
- `/s3/*` → `$GARAGE_S3_UPSTREAM_URL` (default `http://garage:3900`) — **only injected when `GARAGE_S3_PROXY=true`**. The entrypoint builds the `location /s3/ { ... }` block as a string in `$S3_PROXY_BLOCK` and substitutes it into the template; when the flag is `false`, the placeholder expands to empty and no `/s3/` route exists.
- All other routes → `index.html` (SPA fallback)

When the S3 proxy is enabled, `client_max_body_size 0` on the `/s3/` location removes nginx's upload size limit.

## Docker Build

Two-stage Dockerfile:

1. **Builder** (`node:22-alpine`) — runs `npm ci` + `npm run build` → produces `dist/`
2. **Serve** (`nginx:alpine`) — copies `dist/` to nginx webroot, installs `gettext` for `envsubst`, runs `docker-entrypoint.sh` as the entrypoint

The entrypoint:

1. Writes `/usr/share/nginx/html/config.js` from `GARAGE_API_URL`, `GARAGE_ADMIN_TOKEN`, and `GARAGE_S3_PROXY`.
2. Builds the optional `$S3_PROXY_BLOCK` string when `GARAGE_S3_PROXY=true`.
3. Runs `envsubst` over `nginx.conf.template`, substituting `${GARAGE_UPSTREAM_URL}` and `${S3_PROXY_BLOCK}`.
4. Execs nginx in the foreground.

## API Type Generation

```bash
npm run generate-api
# runs: openapi-typescript docs/garage-admin-v2.json -o src/api/garage.d.ts
```

The generated file is committed. Re-run this command when upgrading `docs/garage-admin-v2.json` to a newer Garage API version. The `openapi-fetch` client enforces the generated types at compile time — TypeScript will catch mismatched request/response shapes.

### Notable API Shape Quirks

- Endpoints that target specific nodes (`ListWorkers`, `ListBlockErrors`, `LaunchRepairOperation`, etc.) require `params: { query: { node: "*" } }` — use `"*"` for all nodes or a node ID for a single node.
- Multi-node responses return `{ error: { nodeId: msg }, success: { nodeId: T[] } }` — flatten with `Object.values(data.success).flat()`.
- `DeleteBucket`, `DeleteKey`, `DeleteAdminToken` use query params (`params.query.id`), not a request body.
- `CreateAdminToken` returns `secretToken` (shown once); listed tokens expose only `id` (a prefix of the full token).
- `PurgeBlocks` body is `string[]` (hash list directly, not wrapped in an object).
