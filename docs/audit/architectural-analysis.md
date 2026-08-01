# Remaining Work After Refactoring

The codebase has been significantly refactored (AWS Lambda → Cloudflare Workers + Durable Objects, module-level state → class-based architecture). Most critical/high issues from the original audits are resolved.

## HIGH PRIORITY (Fix Before Production)

### 2. hangUp Sends Null strangerId
- **Location**: `packages/webrtc/src/peer-connection-engine.ts:152`
- **Issue**: `strangerId as string` sends `null` if hangUp called before match. Server cannot route message.
- **Fix**: Guard before sending:
  ```typescript
  if (!currentStrangerId) return;
  ```

### 3. setRemoteDescription Errors Not Propagated to UI
- **Location**: `packages/webrtc/src/peer-connection-engine.ts:284-286`
- **Issue**: `.catch(this.logger.error)` swallows error. Call hangs silently with no user feedback.
- **Fix**: Emit error via `events.onError`:
  ```typescript
  try {
    await this.myPeerConnection.setRemoteDescription(desc);
  } catch (err) {
    this.events.onError?.(err as Error);
    throw err;
  }
  ```

### 4. No Search Timeout
- **Location**: `apps/frontend/src/hooks/use-video-chat.ts`, `packages/webrtc/src/peer-connection-engine.ts`
- **Issue**: User clicks "Start" → sends START → if no peer available, waits indefinitely with no feedback.
- **Fix**: Add 30s timeout in `PeerConnectionEngine.start()` or hook, emit error via `onError`.

### 5. No WebSocket Authentication
- **Location**: `packages/signaling-cf/src/signaling-do.ts`
- **Issue**: Any client can connect to WS and inject messages (forge offers, spoof hangups).
- **Fix**: Validate JWT/token in `fetch()` before `acceptWebSocket()`. Use Cloudflare Access or custom authorizer.

---

## MEDIUM PRIORITY (Fix for Production Readiness)

### 6. No Track Replacement API (Mute, Screen Share)
- **Location**: `packages/webrtc/src/peer-connection-engine.ts`
- **Issue**: No public `replaceTrack()` method. Cannot implement mute/unmute, camera switch, or screen sharing without full renegotiation.
- **Fix**: Add method:
  ```typescript
  async replaceTrack(kind: 'audio' | 'video', newTrack: MediaStreamTrack): Promise<void>
  ```

### 7. JSON.parse Crash on Binary WebSocket Messages
- **Location**: `apps/frontend/src/hooks/use-video-chat.ts:180`
- **Issue**: `JSON.parse(lastMessage?.data ?? '...')` throws if `data` is Blob/ArrayBuffer.
- **Fix**:
  ```typescript
  const data = typeof lastMessage.data === 'string'
    ? lastMessage.data
    : new TextDecoder().decode(lastMessage.data);
  const message = JSON.parse(data);
  ```

### 8. No ICE Restart on Failed/Disconnected
- **Location**: `packages/webrtc/src/peer-connection-engine.ts:334-336`
- **Issue**: Only `closed`/`failed` trigger `closeVideoCall()`. No ICE restart attempt on `disconnected` or `failed`.
- **Fix**: On `failed` with `iceGatheringState === 'complete'`, trigger ICE restart via `createOffer({ iceRestart: true })`.

### 9. role Not Exposed to React UI
- **Location**: `apps/frontend/src/hooks/use-video-chat.ts` return object
- **Issue**: `ChatSession` exposes `role` getter but hook doesn't return it. UI cannot show caller/callee status.
- **Fix**: Add `role: sessionRef.current?.role ?? null` to hook return.

---

## LOW PRIORITY (Quality Improvements)

### 10. Hardcoded 4:3 Aspect Ratio Only
- **Location**: `packages/webrtc/src/media-constraints.ts:14`
- **Issue**: `aspectRatio: { ideal: 1.333333 }` only. Modern phones use 19:9, 20:9. May cause fallback to lower resolution.
- **Fix**: Use width/height with ideal/max, or make constraints configurable.

### 11. Unsafe `as RTCSessionDescription` Casts
- **Location**: `packages/webrtc/src/peer-connection-engine.ts:272, 388`
- **Issue**: `localDescription as RTCSessionDescription` — TypeScript narrowed but runtime could be null.
- **Fix**: Add null checks or use `!` with assertion comments.

### 12. No Structured Logging/Metrics
- **Location**: All packages
- **Issue**: Uses `console` via `Logger` interface. No correlation IDs, log levels, metrics export (OpenTelemetry), or error tracking (Sentry).
- **Fix**: Implement structured logger with context, add metrics for call duration, ICE state transitions, error rates.

---

## FIXED (Reference — No Action Needed)

The following were resolved in the refactor:
- ✅ TURN server support via Metered (dynamic credential fetching)
- ✅ PeerConnection cleanup on unmount/reconnect (`dispose()` pattern)
- ✅ Complete PC state monitoring (5 event handlers)
- ✅ Glare handling (deterministic role assignment in DO)
- ✅ Dynamic ICE config via `REQUEST_TURN_CREDENTIALS`
- ✅ Module-level mutable state eliminated (class-based encapsulation)
- ✅ `remoteIceCandidates` properly cleared
- ✅ WebSocket reconnection handled (new session on reconnect)
- ✅ `alert()` replaced with toast notifications
- ✅ Media constraints fixed (no contradictory max < ideal)
- ✅ Tracks stopped on hangup (transceiver.stop())
- ✅ ICE candidate queuing with `hasRemoteDescription` guard
- ✅ TOCTOU race in peer matching (atomic `claimAvailable` via single UPDATE ... RETURNING)

---

## Remediation Order

1. **hangUp null guard** — prevents malformed messages
2. **Search timeout** — basic UX requirement
3. **SDP error propagation** — prevents silent hangs
4. **WS authentication** — security baseline
5. **Track replacement API** — enables mute/screen-share
6. **Binary WS message handling** — robustness
7. **ICE restart** — network resilience
8. **Role exposure** — UI completeness
9. **Constraints, type casts, logging** — quality