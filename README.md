<h1 align="center">Garage Admin UI</h1>

<p align="center">
  A web-based administration interface for <a href="https://garagehq.deuxfleurs.fr/"><b>Garage</b></a> — a self-hosted S3-compatible distributed object store by <a href="https://deuxfleurs.fr/">Deuxfleurs</a>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/Vite-6-646CFF?style=flat&logo=vite&logoColor=white" alt="Vite 6">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?style=flat&logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/shadcn/ui-000000?style=flat&logo=shadcnui&logoColor=white" alt="shadcn/ui">
  <img src="https://img.shields.io/badge/TanStack_Query-v5-FF4154?style=flat&logo=reactquery&logoColor=white" alt="TanStack Query">
  <img src="https://img.shields.io/badge/Garage-v2_API-7B68EE?style=flat" alt="Garage v2 API">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat&logo=docker&logoColor=white" alt="Docker ready">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat" alt="License MIT">
</p>

---

## About

**Garage Admin UI** gives you a friendly, shadcn-styled control panel for your [Garage](https://garagehq.deuxfleurs.fr/) cluster — manage nodes, buckets, keys, and even browse object storage straight from your browser.

> [**Garage**](https://garagehq.deuxfleurs.fr/) is an open-source, lightweight, geo-distributed S3-compatible object store built by [Deuxfleurs](https://deuxfleurs.fr/). It runs on modest hardware, replicates across multiple sites, and speaks the S3 API — perfect for self-hosters and small infrastructures. Learn more on the [official docs](https://garagehq.deuxfleurs.fr/documentation/quick-start/) or the [Git repository](https://git.deuxfleurs.fr/Deuxfleurs/garage).

Built with React 19, Vite 6, shadcn/ui, TanStack Query, and the Garage v2 admin API.

## Features

### 🌐 Cluster
- Live node status, health tiles, per-node storage bars
- Aggregate storage summary (total / used / free with color-coded progress bar)

### 🗺️ Layout
- View current node roles and staged changes
- Apply, revert, or preview layout changes; full layout history

### 🪣 Buckets
- List, create, and delete buckets
- Manage key permissions per bucket (grant/revoke read, write, owner per key)
- Configure S3 CORS rules with one click

### 📁 Bucket Browser
- Folder navigation with breadcrumb trail
- Drag-and-drop file upload with per-file progress bars (multipart for files > 5 MB)
- Paginated object listing (100 items per page, continuation token navigation)
- Multi-select files with bulk delete
- Create folders
- Download and delete individual files
- **In-browser file preview** — images, PDF, text, JSON, and code files without downloading

### 🔑 Access Keys
- Create keys (secret shown once, copy to clipboard)
- Key detail view: list all buckets the key has access to with their permissions, direct link to bucket browser
- Delete keys

### 🛡️ Admin Tokens
- Create tokens with optional expiry date
- List and revoke tokens

### 🛠️ Workers & Maintenance
- Worker status table
- Launch repair jobs, clean up incomplete uploads, create metadata snapshots
- Set worker variables

### 🔍 Block Inspection
- List block errors, retry or purge per block
- Inspect objects by bucket/key
- Block info lookup

### ⚙️ Settings
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

> **Prefer the CLI?** See [Creating keys from the Garage CLI](#creating-keys-from-the-garage-cli) below.

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

## Creating keys from the Garage CLI

The UI is the easiest way, but everything can also be done with the `garage` CLI on the cluster node. Reference: [Garage Quick-start docs](https://garagehq.deuxfleurs.fr/documentation/quick-start/) and the [CLI reference](https://garagehq.deuxfleurs.fr/documentation/reference-manual/cli/).

> If Garage runs in Docker, prefix every command with `docker exec -ti <container> /garage` (e.g. `docker exec -ti garage /garage key list`). Otherwise just call `garage` directly on the host.

### 🔑 Create an access key

```bash
garage key create my-app-key
```

Output looks like:

```text
Key name: my-app-key
Key ID:   GK<...>
Secret key: <hex-secret>
Can create buckets: false
Authorized buckets: (none)
```

> ⚠️ The **Secret key** is only printed at creation time — copy it immediately. You'll paste both the Key ID and Secret into **Settings → S3 API** in this UI.

### 📋 Inspect / list keys

```bash
garage key list                 # all keys (ID + name only)
garage key info my-app-key      # full details for one key
```

`garage key info` re-prints the secret, but only if the key was created on Garage v1.0.0+ with the secret retained on the node.

### 🪣 Create a bucket (optional)

```bash
garage bucket create my-bucket
garage bucket list
garage bucket info my-bucket
```

### ✅ Grant bucket permissions to the key

```bash
garage bucket allow \
  --read \
  --write \
  --owner \
  my-bucket \
  --key my-app-key
```

Drop `--owner` if the key should only read/write objects but not change bucket settings. To revoke later:

```bash
garage bucket deny --read --write --owner my-bucket --key my-app-key
```

### 🌐 Add a global alias (optional)

Makes the bucket reachable by a friendly name across all keys:

```bash
garage bucket alias my-bucket my-bucket-alias
```

### 🔁 Rotate or delete a key

```bash
garage key rename my-app-key my-app-key-v2
garage key delete --yes my-app-key
```

Once the key is created and authorized, paste the **Key ID** and **Secret** into **Settings → S3 API** in this UI and you're done — buckets will appear under the **Buckets** tab.

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

## Credits

- 🧡 [**Garage**](https://garagehq.deuxfleurs.fr/) by [Deuxfleurs](https://deuxfleurs.fr/) — the geo-distributed S3-compatible object store this UI manages. ([source](https://git.deuxfleurs.fr/Deuxfleurs/garage))
- 🎨 [shadcn/ui](https://ui.shadcn.com/) — component primitives
- ⚛️ [React](https://react.dev/), [Vite](https://vitejs.dev/), [TanStack Query](https://tanstack.com/query)
- ☁️ [AWS SDK for JavaScript v3](https://github.com/aws/aws-sdk-js-v3) — S3 client
