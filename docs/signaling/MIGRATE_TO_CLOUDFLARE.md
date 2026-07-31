# Migration: AWS → Cloudflare Workers + Durable Objects

## 1. Why Durable Objects Fit This App Perfectly

The signaling server is a **stateful coordination problem** — exactly what DOs are designed for:

| Current Problem | DO Solution |
|---|---|
| Race condition in matchmaking (two concurrent STARTs both find no peer, both go to waiting) | DO input gates serialize storage — findAvailable + setUnavailable are atomic |
| 8 separate Lambda deployments with shared infrastructure (Turso, API GW) | Single DO instance with embedded SQLite |
| External Turso DB adds latency and operational burden | DO SQLite is co-located, synchronous, and durable |
| API Gateway PostToConnection per forwarded message | DO's ws.send() is in-process, instant |
| START lock Promise chain in local server | Unnecessary — DO input gates solve it natively |

## 2. Architecture: Before vs After

**Before (AWS):**

```
Browser → AWS API Gateway WS → 8× Lambda → Turso DB (external)
                                         → Metered API (TURN)
```

**After (Cloudflare):**

```
Browser → Cloudflare Worker (upgrade) → 1× Durable Object (WebSocket Hibernation)
                                         ├── SQLite storage (connections)
                                         ├── Metered API (TURN — fetch, unchanged)
                                         └── Map<connectionId, WebSocket> in memory
```

## 3. What Stays Exactly the Same

| Component | File(s) | Change |
|---|---|---|
| Shared message types | packages/signaling-types/src/messages.ts | Zero changes |
| Use cases (business logic) | use-cases/find-stranger.ts, forward-message.ts, connect-peer.ts, disconnect-peer.ts, request-turn-credentials.ts | Zero changes (pure logic, platform-agnostic) |
| Domain ports | domains/connection.ts, signaling.ts, turn-credential.ts | Zero changes |
| Metered TURN adapter | adapters/gateways/metered-turn-credential-gateway.ts | Zero changes (already uses fetch) |
| Frontend chat.ts | apps/frontend/src/lib/chat.ts | Zero changes |
| Frontend use-video-chat.ts | apps/frontend/src/hooks/use-video-chat.ts | Zero changes |

## 4. What Gets Replaced (New Cloudflare Adapters)

### 4.1 CloudflareSignalingGateway (replaces AwsApiGatewaySignalingGateway)

Uses DO's getWebSockets() + serializeAttachment to find and send to a connection in-process — no HTTP round-trip per message.

### 4.2 DoConnectionRepository (replaces TursoConnectionRepository)

Uses DO synchronous SQLite storage instead of the Turso HTTP client. All IConnectionRepository operations become sync SQL exec calls — no network, no race conditions.

### 4.3 SignalingDO (replaces 8 Lambdas + API Gateway)

A single Durable Object class using the WebSocket Hibernation API:

- **Constructor**: Runs schema migration (CREATE TABLE IF NOT EXISTS connections), rebuilds in-memory WebSocket map from getWebSockets() + deserializeAttachment()
- **fetch()**: Accepts WebSocket upgrade via WebSocketPair, assigns connectionId, stores attachment with metadata, executes ConnectPeer use case
- **webSocketMessage()**: Parses JSON action, dispatches to FindStranger / ForwardMessage / RequestTurnCredentials use cases
- **webSocketClose()**: Executes DisconnectPeer use case

### 4.4 Worker Entrypoint (replaces API Gateway)

A thin Worker that routes all /ws requests to the DO stub via getByName("default").

### 4.5 wrangler.jsonc (replaces infra/ Pulumi + bundler.mjs)

Declares the DO binding, migration, environment variables (METERED_APP_DOMAIN, METERED_SECRET_KEY).

## 5. What Gets Removed Entirely

| File/Directory | Reason |
|---|---|
| infra/ (entire Pulumi directory) | Replaced by wrangler.jsonc |
| packages/signaling-ws/bundler.mjs | wrangler handles bundling |
| adapters/gateways/aws-api-gateway-signaling-gateway.ts | Replaced by DO gateway |
| adapters/repositories/turso-connection-repository.ts | Replaced by DO SQLite |
| lib/di-container.ts | DI is simpler — DO constructor wires use cases once |
| lib/wrap-handler.ts | Lambda error wrapper — no longer needed |
| handlers/*.ts (8 files) | Logic moves into DO's webSocketMessage() |
| ws-*/index.ts (8 re-export files) | No longer needed |
| @aws-sdk/client-apigatewaymanagementapi | Remove dependency |
| @libsql/client/web | Remove dependency |
| aws-lambda types | Remove dependency |

## 6. Frontend Changes (Minimal)

Only apps/frontend/src/config.ts needs updating:

```typescript
const config = {
  signalingServer: {
    URL: import.meta.env.VITE_SIGNALING_URL || 'wss://webrtc-signaling.your-subdomain.workers.dev'
  }
};
```

The frontend's react-use-websocket connects to the Worker URL, gets a 101 upgrade, and gets routed to the DO. All message types, SDP/ICE logic, and TURN credential caching stay identical.

## 7. Step-by-Step Execution Plan

### Phase 1: New Cloudflare package (keep old code side by side)

| Step | Action |
|---|---|
| 1 | Create packages/signaling-cf/ with wrangler.jsonc, package.json, tsconfig.json |
| 2 | Add packages/signaling-cf to pnpm-workspace.yaml |
| 3 | Write src/adapters/gateways/cloudflare-signaling-gateway.ts |
| 4 | Write src/adapters/repositories/do-connection-repository.ts |
| 5 | Write src/signaling-do.ts (the DO class) |
| 6 | Write src/worker.ts (thin entrypoint) |
| 7 | Reuse @repo/signaling-types as a workspace dependency |
| 8 | Reuse use cases from @repo/signaling-ws (or copy — they're pure logic) |
| 9 | Add pnpm run deploy:cf script to root package.json |

### Phase 2: Test locally with wrangler dev

| Step | Action |
|---|---|
| 10 | npx wrangler dev — spawns DO locally on localhost:8787 |
| 11 | Set frontend to ws://localhost:8787, verify full WebRTC signaling flow |
| 12 | Run existing Playwright tests against the Cloudflare backend |

### Phase 3: Deploy

| Step | Action |
|---|---|
| 13 | npx wrangler deploy — deploys Worker + DO to Cloudflare edge |
| 14 | Set VITE_SIGNALING_URL to the deployed Worker URL |
| 15 | Deploy frontend (existing Vite build → static hosting, or Cloudflare Pages) |

### Phase 4: Decommission AWS

| Step | Action |
|---|---|
| 16 | Verify production traffic is flowing through Cloudflare |
| 17 | pulumi destroy in infra/ to tear down API Gateway + Lambdas + Turso |

## 8. Effort Estimate

| Area | Effort | Notes |
|---|---|---|
| New adapters (2 files) | ~60 lines each | Straightforward — maps ports to DO APIs |
| DO class | ~150 lines | Reuse logic pattern from local-server/index.ts |
| Worker entrypoint | ~10 lines | Just forwards to DO |
| wrangler.jsonc | ~20 lines | Config + env vars |
| Remove old code | — | Delete after migration complete |
| **Total new code** | **~250 lines** | |

The existing local-server/index.ts is a good template — it already wires use cases with in-memory adapters in a single process. The DO will look structurally similar.

## 9. Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Single DO vs sharded DO | Single getByName("default") | All peers need to see each other for matchmaking; POC scale |
| SQLite vs DO KV storage | SQLite | Supports SELECT WHERE is_available = 1 queries — KV would require manual indexing |
| WebSocket Hibernation vs regular | Hibernation | Lower cost, DO evicts between messages, no active billable CPU while idle |
| Metered TURN adapter | Reuse as-is | Already uses fetch — works identically in Workers runtime |
| react-use-websocket on frontend | Keep as-is | Works against any WebSocket endpoint, no changes needed |
| Shared signaling-types package | Keep as-is | Pure type definitions, platform-agnostic |

## 10. Dependencies to Add

```json
{
  "dependencies": {
    "@repo/signaling-types": "workspace:*"
  },
  "devDependencies": {
    "wrangler": "^4.x",
    "typescript": "^5.x",
    "@cloudflare/workers-types": "^4.x"
  }
}
```

No AWS SDK, no @libsql/client, no @aws-sdk/client-apigatewaymanagementapi.
