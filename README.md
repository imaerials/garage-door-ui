# Garage Admin UI

A web-based administration interface for [Garage](https://garagehq.deuxfleurs.fr/) — a self-hosted S3-compatible distributed object store.

Built with React 19, Vite 6, shadcn/ui, TanStack Query, and the Garage v2 admin API.

## Features

### Cluster
- Live node status, health tiles, per-node storage bars
- Aggregate storage summary (total / used / free with color-coded progress bar)

### Layout
- View current node roles and staged changes
- Apply, revert, or preview layout changes; full layout history

### Buckets
- List, create, and delete buckets
- Manage key permissions per bucket (grant/revoke read, write, owner per key)
- Configure S3 CORS rules with one click

### Bucket Browser
- Folder navigation with breadcrumb trail
- Drag-and-drop file upload with per-file progress bars (multipart for files > 5 MB)
- Paginated object listing (100 items per page, continuation token navigation)
- Multi-select files with bulk delete
- Create folders
- Download and delete individual files
- **In-browser file preview** — images, PDF, text, JSON, and code files without downloading

### Access Keys
- Create keys (secret shown once, copy to clipboard)
- Key detail view: list all buckets the key has access to with their permissions, direct link to bucket browser
- Delete keys

### Admin Tokens
- Create tokens with optional expiry date
- List and revoke tokens

### Workers & Maintenance
- Worker status table
- Launch repair jobs, clean up incomplete uploads, create metadata snapshots
- Set worker variables

### Block Inspection
- List block errors, retry or purge per block
- Inspect objects by bucket/key
- Block info lookup

### Settings
- Configure Admin API base URL and token
- Configure S3 endpoint, access key ID, and secret
- Export all settings to a JSON file
- Import settings from a JSON file (applied immediately, no manual Save needed)

---

## Configuration

### Step 1 — Admin API

Go to **Settings → Admin API**:

| Field | Value |
|---|---|
| Base URL | `http://<garage-host>:3903` |
| Admin Token | value of `admin_token` in your `garage.toml` |

Click **Save**.

> In dev mode you can leave the Base URL as `/api` — Vite proxies it to `localhost:3903`.

### Step 2 — Access Key

Go to **Access Keys → New Key**, give it a name, and copy the **Key ID** and **Secret**. Keep the secret — it is only shown once.

### Step 3 — Grant bucket permissions

Go to **Buckets**, find your bucket, click **Keys**, then grant the key **read + write** (and **owner** if you want to manage the bucket).

### Step 4 — S3 API

Go to **Settings → S3 API**:

| Field | Value |
|---|---|
| S3 Endpoint URL | `http://<garage-host>:3900` |
| Access Key ID | the key ID from Step 2 |
| Secret Access Key | the secret from Step 2 |

Click **Save S3 Settings**.

### Step 5 — Configure CORS (first time per bucket)

Go to **Buckets → Browse** on any bucket. The first load may fail with a CORS error — that is expected. Click **Configure CORS** in the top-right corner. This sets permissive cross-origin rules on the bucket via the admin API. Reload the page — the browser can now access S3 directly.

> CORS only needs to be configured once per bucket.

---

## Quick Start (development)

```bash
pnpm install
pnpm dev           # http://localhost:5173
```

Follow the configuration steps above. Use `http://<garage-host>:3903` as the Admin API Base URL and `http://<garage-host>:3900` as the S3 Endpoint.

## Docker

```bash
cp .env.example .env       # then edit the URLs for your Garage host
docker compose up -d --build
# open http://localhost:8080
```

`docker-compose.yml` reads from `.env` via `env_file:`. The variables below are passed through to the container's nginx + entrypoint.

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `GARAGE_UPSTREAM_URL` | `http://garage:3903` | Garage admin API — nginx proxies `/api/*` here |
| `GARAGE_S3_UPSTREAM_URL` | `http://garage:3900` | Garage S3 API — used by the optional `/s3/*` proxy (see `GARAGE_S3_PROXY`) |
| `GARAGE_ADMIN_TOKEN` | _(empty)_ | Pre-fills the admin token in Settings |
| `GARAGE_API_URL` | `/api` | Admin API URL seen by the browser |
| `GARAGE_S3_PROXY` | `false` | When `true`, nginx proxies `/s3/*` to `GARAGE_S3_UPSTREAM_URL`. **Only works for anonymous/unsigned S3** — SigV4 signatures break across a path-rewriting proxy. Leave `false` for normal use. |

Example `.env` for an existing Garage instance on the LAN:

```bash
GARAGE_UPSTREAM_URL=http://192.168.68.71:3903
GARAGE_S3_UPSTREAM_URL=http://192.168.68.71:3900
GARAGE_ADMIN_TOKEN=your-token-here
GARAGE_API_URL=/api
GARAGE_S3_PROXY=false
```

### S3 access in Docker — two modes

The `GARAGE_S3_PROXY` switch decides how the browser reaches the S3 API:

**1. Direct (default, `GARAGE_S3_PROXY=false`)** — recommended for normal use.

- Browser talks to `http://<garage-host>:3900` directly using AWS SigV4 signing.
- In **Settings → S3** set the S3 Endpoint to the full URL of your Garage S3 port (e.g. `http://192.168.68.71:3900`).
- CORS must be configured per bucket — see [Step 5](#step-5--configure-cors-first-time-per-bucket).
- **Common symptom if the endpoint is left blank**: the AWS SDK falls back to `s3.<region>.amazonaws.com` and you get `ERR_NAME_NOT_RESOLVED`.

**2. Proxied (`GARAGE_S3_PROXY=true`)** — anonymous/unsigned S3 only.

- nginx proxies `/s3/*` → `GARAGE_S3_UPSTREAM_URL`.
- In **Settings → S3** set the S3 Endpoint to `/s3` (same-origin, no CORS needed).
- ⚠ **SigV4 signatures do not survive a path-rewriting proxy**, so this only works for buckets you've explicitly opened for anonymous access. Don't use this for normal authenticated traffic.

## Build

```bash
pnpm build             # production bundle → dist/
pnpm generate-api      # regenerate TypeScript types from docs/garage-admin-v2.json
```

## API Reference

The Garage admin API spec is at `docs/garage-admin-v2.json` (OpenAPI 3.1, Garage v2.3.0).
TypeScript types are auto-generated — run `pnpm generate-api` after updating the spec.
