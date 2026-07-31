# Video Chat (WebRTC) — Turborepo + Cloudflare

A WebRTC video chat (peer-to-peer, randomized stranger matching) built as a pnpm/Turborepo monorepo and deployed to Cloudflare Workers + Durable Objects.

## Stack

- **Frontend:** React 19 + TypeScript + Vite (`apps/frontend`)
- **Signaling:** Cloudflare Worker + Durable Object (`packages/signaling-cf`)
- **Storage:** Durable Object embedded SQLite (no external database)

## Workspace layout

```
apps/frontend              React + Vite frontend
packages/signaling-cf      Cloudflare Worker + Durable Object (WebSocket signaling)
packages/signaling-core    Shared ports, domain models, use cases + Metered adapter
packages/signaling-types   Shared message types
packages/typescript-config Shared tsconfigs
```

## Prerequisites

- **Node** ≥ 18, **pnpm** 9
- **Turborepo** (global): `pnpm install turbo --global` — [docs](https://turbo.build/repo/docs/getting-started/installation)

## Install

```bash
pnpm install
```

## Common commands

Run from the repo root:

```bash
pnpm dev           # start frontend + local signaling worker (persistent)
pnpm build         # build all packages
pnpm lint          # lint all packages (biome)
pnpm check-types   # type-check all packages
pnpm clean         # remove node_modules / build caches
```

## Local development

The frontend talks to a local Cloudflare signaling worker (`wrangler dev` on port `8787`), backed by a Durable Object with in-memory/SQLite storage. No external services needed.

**1. Start the signaling worker** (port `8787`):

```bash
pnpm --filter @repo/signaling-cf dev
```

**2. Start the frontend** (port `5173`):

```bash
pnpm --filter @repo/frontend dev:local   # sets VITE_LOCAL_MODE=true
```

Open `http://localhost:5173` in **two tabs/windows** to test a call between peers. Video/audio connect directly P2P via WebRTC; only signaling is local.

### Frontend env (`apps/frontend/.env`)

| Variable           | Description                                                                |
| ------------------ | -------------------------------------------------------------------------- |
| `VITE_LOCAL_MODE`  | `true` → connect to `ws://localhost:8787/ws`. `false` → use `VITE_SIGNALING_URL`. |
| `VITE_SIGNALING_URL` | Deployed Worker WebSocket URL (e.g. `wss://…/ws`). Ignored in local mode. |

## End-to-end tests

One Playwright test drives the real peer-to-peer flow: two browser contexts,
the browser's own `RTCPeerConnection`, real SDP/ICE negotiation, real media
(Chromium's fake capture device) and the real local signaling worker. Nothing is
mocked.

```bash
pnpm --filter @repo/frontend exec playwright install chromium   # once
pnpm --filter @repo/frontend test                               # run the suite
```

The suite starts what it needs and does not touch your dev setup: the signaling
worker on `8787` (reused if already running) and its **own** Vite server on
`5273` with `VITE_LOCAL_MODE=true`, so a `pnpm dev` on `5173` — and any
`.env.local` pointing at a deployed Worker — is ignored.

One shared piece of state can break a run: a browser tab left on
"Looking for peer..." sits in the signaling worker's matching pool and gets
matched with one of the test's peers. The suite checks for this first and fails
with an explicit message rather than timing out.

## Deploy to Cloudflare (Workers + Durable Objects)

The signaling backend runs as a Cloudflare Worker with a Durable Object (`packages/signaling-cf`) — WebSocket Hibernation + embedded SQLite. See `docs/signaling/ARCHITECTURE.md` for the architecture.

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

## TURN credentials (Metered)

TURN credentials are short-lived (4h, Metered's minimum) and minted on demand by the signaling worker's `REQUEST_TURN_CREDENTIALS` handler. The frontend caches the returned `iceServers` until their `expiresAt` (minus a 60s safety margin), then re-requests. Reuse-first: the gateway lists existing valid credentials under a single shared label and reuses one before minting, so the live credential set stays at ~1 regardless of traffic. Expired credentials don't count against the account's create cap; minting with the existing label overwrites the previous one. No mid-call renewal is needed — 4h exceeds any single call.

Configure via `METERED_APP_DOMAIN` and `METERED_SECRET_KEY` (see [Deploy to Cloudflare](#deploy-to-cloudflare-workers--durable-objects)).
