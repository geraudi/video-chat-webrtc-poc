# AGENTS.md — Video Chat WebRTC POC

## Project Overview
Peer-to-peer video chat application using WebRTC, deployed on Cloudflare Workers with WebSocket signaling. Built as a Turborepo monorepo.

## Monorepo Structure
```
video-chat-webrtc-poc/
├── apps/
│   └── frontend/          # React + Vite web client
├── packages/
│   ├── signaling-types/   # Shared TypeScript message types
│   ├── signaling-core/    # Shared ports, domain models, use cases + Metered adapter
│   ├── signaling-cf/      # Cloudflare Worker + Durable Object — platform adapters only
│   ├── ui/                # Shared UI components
│   └── typescript-config/ # Shared TypeScript configs
├── package.json           # Root workspace config
├── turbo.json             # Turborepo pipeline config
└── pnpm-workspace.yaml    # Workspace definitions
```

## Commands

### Development
```bash
pnpm i                    # Install all dependencies
pnpm dev                  # Start all packages in dev mode
pnpm build                # Build all packages
pnpm lint                 # Lint all packages (using Biome)
pnpm type-check           # Type-check all packages
pnpm clean                # Clean all caches and node_modules
```

### Frontend Only
```bash
cd apps/frontend
pnpm dev                  # Start Vite dev server (localhost:5173)
pnpm build                # Production build
pnpm preview              # Preview production build
pnpm check-types           # Type-check only
```

### Cloudflare Signaling Worker
```bash
pnpm --filter @repo/signaling-cf dev       # wrangler dev → ws://localhost:8787/ws
pnpm run deploy:cf                         # wrangler deploy (root script)
cd packages/signaling-cf
npx wrangler secret put METERED_APP_DOMAIN # set Metered credentials as secrets
npx wrangler secret put METERED_SECRET_KEY
```

### Prerequisites
1. **Turbo repo** — `pnpm install turbo --global`
2. **Cloudflare account** — `npx wrangler login` (or `CLOUDFLARE_API_TOKEN`)

## Key Technical Details

### WebRTC Flow
1. User clicks "Start" → sends `START` message via WebSocket
2. Durable Object matches with available peer via embedded SQLite lookup
3. Both peers receive `initOffer` with roles (caller/callee) and strangerId
4. Caller creates SDP offer → sent via `videoOffer` message
5. Callee responds with SDP answer → sent via `videoAnswer` message
6. ICE candidates exchanged via `newIceCandidate` messages
7. Peer connection established — direct P2P media stream

### Signaling Message Types (from `packages/signaling-types/src/messages.ts`)
| Action | Direction | Purpose |
|--------|-----------|---------|
| `START` | Client → Server | Request peer matching |
| `initOffer` | Server → Client | Assign role + match peer |
| `videoOffer` | Client → Server → Client | SDP offer exchange |
| `videoAnswer` | Client → Server → Client | SDP answer exchange |
| `newIceCandidate` | Client → Server → Client | NAT traversal candidates |
| `hangUp` | Client → Server → Client | Terminate call |

### Cloudflare Worker + Durable Object (from `packages/signaling-cf/`)
| File | Role |
|------|------|
| `src/worker.ts` | Thin entrypoint — routes `/ws`, `/websocket`, `/health` to the DO stub |
| `src/signaling-do.ts` | `SignalingDO` — WebSocket Hibernation, SQLite schema, connects adapters to use cases, dispatches messages |
| `src/adapters/gateways/cloudflare-signaling-gateway.ts` | `ISignalingGateway` — in-process `ws.send()` via `getWebSockets()` |
| `src/adapters/repositories/do-connection-repository.ts` | `IConnectionRepository` — synchronous DO SQLite storage |

The `SignalingDO` uses the WebSocket Hibernation API: `fetch()` accepts the upgrade and runs `ConnectPeer`, `webSocketMessage()` parses the action and dispatches to `FindStranger` / `ForwardMessage` / `RequestTurnCredentials`, `webSocketClose()` runs `DisconnectPeer`.

### Frontend Architecture (from `apps/frontend/src/`)
```
src/
├── app.tsx              # Root component
├── hooks/
│   └── use-video-chat.ts  # Main WebRTC + WS orchestration hook
├── lib/
│   ├── chat.ts            # Core WebRTC peer connection logic
│   └── utils.ts           # Utility functions
├── components/
│   └── video-chat.tsx     # Video chat UI component
└── config.ts             # Environment configuration
```

### Database Schema (Durable Object SQLite)
```sql
CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  is_available INTEGER DEFAULT 0
);
```
- `id` = generated connectionId (UUID)
- `is_available = 1` means user is waiting for a match

## Environment Variables (required for deployment)
| Variable | Purpose |
|----------|---------|
| `METERED_APP_DOMAIN` | Metered TURN app domain |
| `METERED_SECRET_KEY` | Metered TURN secret key |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token (alternative to `wrangler login`) |

## Known Limitations
- Only Google STUN server (no TURN — fails behind symmetric NAT/firewalls)
- No authentication/authorization on WebSocket connections
- Single Durable Object instance (all peers share one matching pool)
