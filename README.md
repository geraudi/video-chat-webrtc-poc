# Video Chat (WebRTC) — Turborepo + Pulumi

A WebRTC video chat (peer-to-peer, randomized stranger matching) built as a pnpm/Turborepo monorepo and deployed to AWS with Pulumi.

## Stack

- **Frontend:** React 19 + TypeScript + Vite (`apps/frontend`)
- **Signaling:** AWS API Gateway (WebSockets) + Lambda (`packages/signaling-ws`)
- **Database:** Turso (libSQL)
- **Infra:** Pulumi → API Gateway, Lambda, S3 static website (`infra`)

## Workspace layout

```
apps/frontend              React + Vite frontend
packages/signaling-ws      Lambda handlers + local dev server
packages/signaling-types   Shared message types
packages/typescript-config Shared tsconfigs
infra                      Pulumi IaC
```

## Prerequisites

- **Node** ≥ 18, **pnpm** 9
- **Turborepo** (global): `pnpm install turbo --global` — [docs](https://turbo.build/repo/docs/getting-started/installation)
- **Pulumi:** `brew install pulumi/tap/pulumi`
- **AWS credentials** configured for Pulumi — [setup](https://www.pulumi.com/registry/packages/aws/installation-configuration)

## Install

```bash
pnpm install
```

## Common commands

Run from the repo root:

```bash
pnpm dev           # start frontend + local signaling server (persistent)
pnpm build         # build all packages
pnpm lint          # lint all packages (biome)
pnpm check-types   # type-check all packages
pnpm clean         # remove node_modules / build caches
```

## Local development (no AWS required)

The frontend talks to a local WebSocket signaling server (in-memory store, no Turso needed). The frontend selects the target via `VITE_LOCAL_MODE`.

**1. Start the local signaling server** (port `3001`):

```bash
pnpm --filter @repo/signaling-ws dev
```

**2. Start the frontend** (port `5173`):

```bash
pnpm --filter @repo/frontend dev:local   # sets VITE_LOCAL_MODE=true
```

Open `http://localhost:5173` in **two tabs/windows** to test a call between peers. Video/audio connect directly P2P via WebRTC; only signaling is local.

### Frontend env (`apps/frontend/.env`)

| Variable           | Description                                                                |
| ------------------ | -------------------------------------------------------------------------- |
| `VITE_LOCAL_MODE`  | `true` → connect to `ws://localhost:3001`. `false` → use AWS endpoint.     |
| `VITE_SIGNALING_URL` | AWS API Gateway WebSocket URL (e.g. `wss://…/dev`). Ignored in local mode. |

## End-to-end tests

One Playwright test drives the real peer-to-peer flow: two browser contexts,
the browser's own `RTCPeerConnection`, real SDP/ICE negotiation, real media
(Chromium's fake capture device) and the real local signaling server. Nothing is
mocked.

```bash
pnpm --filter @repo/frontend exec playwright install chromium   # once
pnpm --filter @repo/frontend test                               # run the suite
```

The suite starts what it needs and does not touch your dev setup: the signaling
server on `3001` (reused if already running) and its **own** Vite server on
`5273` with `VITE_LOCAL_MODE=true`, so a `pnpm dev` on `5173` — and any
`.env.local` pointing at AWS — is ignored.

One shared piece of state can break a run: a browser tab left on
"Looking for peer..." sits in the signaling server's matching pool and gets
matched with one of the test's peers. The suite checks for this first and fails
with an explicit message rather than timing out.

## Deploy to Cloudflare (Workers + Durable Objects)

The signaling backend also runs as a Cloudflare Worker with a Durable Object (`packages/signaling-cf`) — WebSocket Hibernation + embedded SQLite replace API Gateway, Lambda and Turso. See `docs/signaling/MIGRATE_TO_CLOUDFLARE.md` for the full migration notes.

### 1. Authenticate

```bash
npx wrangler login        # opens a browser to authorize
# or: export CLOUDFLARE_API_TOKEN=<token>
npx wrangler whoami       # verify login
```

### 2. Configure account

Add your Cloudflare `account_id` (from `wrangler whoami`) to `packages/signaling-cf/wrangler.jsonc`:

```jsonc
"account_id": "your-account-id",
```

### 3. Set Metered credentials as secrets

Do **not** hardcode them in `wrangler.jsonc`. Set them as encrypted secrets:

```bash
cd packages/signaling-cf
npx wrangler secret put METERED_APP_DOMAIN
npx wrangler secret put METERED_SECRET_KEY
```

### 4. Test locally

```bash
pnpm --filter @repo/signaling-cf dev     # wrangler dev → ws://localhost:8787
```

Point the frontend at it and test a call between two tabs. For local dev, set the `vars` block in `wrangler.jsonc` instead of secrets.

### 5. Deploy

```bash
pnpm run deploy:cf           # root script → wrangler deploy in packages/signaling-cf
```

### 6. Point the frontend at it

The Worker serves WebSockets on the `/ws` path, so set:

```
VITE_LOCAL_MODE=false
VITE_SIGNALING_URL=wss://webrtc-signaling.<your-subdomain>.workers.dev/ws
```

## Deploy to AWS

Always deploy from the repo root via Turborepo — it builds the dependencies first (lints, then builds `signaling-types`, `signaling-ws` → `dist/`, and `frontend`) **before** running Pulumi. `signaling-ws#build` regenerates the per-Lambda bundles in `dist/` that Pulumi zips; skipping it deploys stale or missing artifacts.

```bash
pnpm deploy          # root script → turbo deploy (build deps, then pulumi up --yes)
```

> ⚠️ Do **not** run `cd infra && pnpm deploy` directly — that runs only `pulumi up --yes` without building `signaling-ws`'s `dist/`.

After deploy, the WebSocket endpoint is written to `infra/outputs.json` (key: `apiEndpoint`).

### Pulumi configuration

Config lives in `infra/Pulumi.dev.yaml`. Required keys (set before first deploy):

```bash
cd infra
pulumi stack select dev
pulumi config set infra:dbUrl            "<turso-db-url>"      # e.g. libsql://<db>.turso.io
pulumi config set --secret infra:dbToken "<turso-db-token>"
pulumi config set infra:meteredAppDomain "<metered-app-domain>"
pulumi config set --secret infra:meteredSecretKey "<metered-secret-key>"
```

### Test the WebSocket

```bash
wscat -c "$(jq -r .apiEndpoint infra/outputs.json)"
```

## Turso (database) commands

```bash
turso db show --url <db-name>        # DB URL → infra:dbUrl
turso db tokens create <db-name>     # auth token → infra:dbToken
turso db tokens invalidate           # rotate tokens
```

## TURN credentials (Metered)

TURN credentials are short-lived (4h, Metered's minimum) and minted on demand by the `REQUEST_TURN_CREDENTIALS` Lambda. The frontend caches the returned `iceServers` until their `expiresAt` (minus a 60s safety margin), then re-requests. Reuse-first: the gateway lists existing valid credentials under a single shared label and reuses one before minting, so the live credential set stays at ~1 regardless of traffic. Expired credentials don't count against the account's create cap; minting with the existing label overwrites the previous one. No mid-call renewal is needed — 4h exceeds any single call.

Configure via `infra:meteredAppDomain` and `infra:meteredSecretKey` (see [Pulumi configuration](#pulumi-configuration)).
