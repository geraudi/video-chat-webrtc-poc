# Remaining Work After Refactoring

The codebase has been significantly refactored (AWS Lambda → Cloudflare Workers + Durable Objects, module-level state → class-based architecture). Most critical/high issues from the original audits are resolved.

## HIGH PRIORITY (Fix Before Production)

### 1. No WebSocket Authentication
- **Location**: `packages/signaling-cf/src/signaling-do.ts`
- **Issue**: Any client can connect to WS and inject messages (forge offers, spoof hangups).
- **Fix**: Validate JWT/token in `fetch()` before `acceptWebSocket()`. Use Cloudflare Access or custom authorizer.

---

## MEDIUM PRIORITY (Fix for Production Readiness)

### 1. JSON.parse Crash on Binary WebSocket Messages
- **Location**: `apps/frontend/src/hooks/use-video-chat.ts:180`
- **Issue**: `JSON.parse(lastMessage?.data ?? '...')` throws if `data` is Blob/ArrayBuffer.
- **Fix**:
  ```typescript
  const data = typeof lastMessage.data === 'string'
    ? lastMessage.data
    : new TextDecoder().decode(lastMessage.data);
  const message = JSON.parse(data);
  ```

---

## LOW PRIORITY (Quality Improvements)

### 1. No Structured Logging/Metrics
- **Location**: All packages
- **Issue**: Uses `console` via `Logger` interface. No correlation IDs, log levels, metrics export (OpenTelemetry), or error tracking (Sentry).
- **Fix**: Implement structured logger with context, add metrics for call duration, ICE state transitions, error rates.

---

## FIXED (Reference — No Action Needed)

The following were resolved in the refactor:
- ✅ hangUp null strangerId guard (`PeerConnectionEngine.hangUp` skips send when no match)
- ✅ setRemoteDescription errors propagate to UI via `events.onError` (`handleVideoAnswerMsg`)
- ✅ Search timeout (30s) in `PeerConnectionEngine.start()` — emits `onError` + `onClose('timeout')`, hook resets to idle
- ✅ ICE restart on `disconnected`/`failed` when `iceGatheringState === 'complete'` (`createOffer({ iceRestart: true })`, counter reset on reconnect/close, closes after max attempts)
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
- ✅ Unsafe `as RTCSessionDescription` casts replaced with null-guarded local description
- ✅ Track replacement API (`PeerConnectionEngine.replaceTrack` + `ChatSession.replaceTrack`) enabling mute/unmute, camera switch, and screen share without renegotiation. Senders tracked by kind in a `sendersByKind` map so mute (`newTrack = null`) and subsequent unmute both resolve the correct sender; guards kind mismatch, surfaces `replaceTrack` rejections via `onError`. Covered by unit tests (replace audio/video, mute, unmute-after-mute, kind mismatch, no-call, no-sender).
- ✅ Hardcoded 4:3 aspect ratio replaced with configurable `MediaTrackConstraints` (width/height ideal+max) and injectable via `useVideoChat({ mediaConstraints })`

---

## Remediation Order

1. **WS authentication** — security baseline
2. **Binary WS message handling** — robustness
3. **Type casts, logging** — quality