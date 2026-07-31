# AGENTS.md — Video Chat WebRTC POC

## Project Overview
Peer-to-peer video chat application using WebRTC, deployed on AWS with WebSocket signaling. Built as a Turborepo monorepo.

## Monorepo Structure
```
video-chat-webrtc-poc/
├── apps/
│   └── frontend/          # React + Vite web client
├── infra/                 # Pulumi infrastructure as code (AWS)
├── packages/
│   ├── signaling-types/   # Shared TypeScript message types
│   ├── signaling-core/    # Shared ports, domain models, use cases + Metered adapter
│   ├── signaling-ws/      # WebSocket Lambda handlers (AWS) — platform adapters only
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

### Infrastructure
```bash
cd infra
pnpm run deploy           # Deploy to AWS (dev stack)
pulumi stack select dev   # Select dev stack
pulumi config set infra:dbUrl <turso-db-url>
pulumi config set infra:dbToken <turso-auth-token>
```

### Prerequisites
1. **Turbo repo** — `pnpm install turbo --global`
2. **Pulumi** — `brew install pulumi/tap/pulumi`
3. **AWS credentials** — configured via `aws configure` or env vars
4. **Turso DB** — create a database and generate a token:
   ```bash
   turso db tokens create <db-name>
   ```

## Key Technical Details

### WebRTC Flow
1. User clicks "Start" → sends `START` message via WebSocket
2. Server matches with available peer via Turso DB lookup
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

### WebSocket Lambda Handlers (from `packages/signaling-ws/`)
| Handler | Route Selection | Purpose |
|---------|-----------------|---------|
| `ws-start/index.ts` | `START` | Peer matching logic |
| `ws-video-offer/index.ts` | `videoOffer` | Forward SDP offer |
| `ws-video-answer/index.ts` | `videoAnswer` | Forward SDP answer |
| `ws-new-ice-candidate/index.ts` | `newIceCandidate` | Forward ICE candidate |
| `ws-hang-up/index.ts` | `hangUp` | Notify peer to hang up |
| `ws-connect/index.ts` | `$connect` | New WS connection |
| `ws-disconnect/index.ts` | `$disconnect` | Clean up connection |

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

### Database Schema (Turso/LibSQL)
```sql
CREATE TABLE connection (
  id TEXT PRIMARY KEY,
  isAvailable INTEGER DEFAULT 0
);
```
- `id` = API Gateway connectionId
- `isAvailable = 1` means user is waiting for a match

## Environment Variables (required for deployment)
| Variable | Purpose |
|----------|---------|
| `TURSO_AUTH_TOKEN` | Turso database authentication token |
| `TURSO_DB_URL` | Turso database connection URL |
| `AWS_ACCESS_KEY_ID` | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `AWS_DEFAULT_REGION` | Typically `us-east-1` |

## Known Limitations
- Only Google STUN server (no TURN — fails behind symmetric NAT/firewalls)
- Single-region deployment (us-east-1)
- No authentication/authorization on WebSocket connections
- Uses React 19 RC versions (may have stability implications)