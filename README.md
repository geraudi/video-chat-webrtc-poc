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
