# Client Orchestration Refactor Plan

Architectural review of `apps/frontend/src/hooks/use-video-chat.ts` and its sibling `apps/frontend/src/lib/chat.ts`.

Scope: determine whether this orchestration file should remain as-is, be split, or have responsibilities moved into reusable packages under `packages/`, with the goal of an architecture that scales without becoming over-engineered. Pragmatic architecture is favored over theoretical purity.

---
# Todos

- [x] Step 0: Add vitest + turbo test task + smoke tests for signaling-core
- [x] Step 1: Create packages/webrtc scaffold + migrate TurnCredentialCache
- [ ] Step 2: Move PeerConnectionEngine into packages/webrtc
- [ ] Step 3: Add packages/chat; move ChatSession + ID generation
- [ ] Step 4: Slim use-video-chat.ts — instantiate engine+session instead of setters
- [ ] Step 5: Replace alert() with injected onError callback surfaced as toast
- [ ] Step 6: Move getUserMedia from mount-effect to onStart-time
- [ ] Step 7: Delete stray getUserId() fallback; make strangerId null first-class
- [ ] Step 8: Add unit tests for engine (fake factory) + session (fake signaler)

---

# 1. Responsibility analysis

The orchestration file is `apps/frontend/src/hooks/use-video-chat.ts` (222 LOC), but it is inseparable from its sibling `apps/frontend/src/lib/chat.ts` (577 LOC). Together they form one logical "God module" split across two files via a setter-injection bridge. Analyzed as one unit, flagging who actually owns each responsibility.

| # | Responsibility | Where it lives | Complexity | Belongs here? | Why |
|---|---|---|---|---|---|
| R1 | **React state machine** (`idle/searching/connected`, transitions on `onTrack`/`onCloseVideo`) | `use-video-chat.ts:52, 60, 74-91, 94-111` | Low | **Yes (frontend)** | It's literally UI presentation state. |
| R2 | **WebSocket transport + lifecycle** (`react-use-websocket`, readyState effect, `setSignaler`) | `use-video-chat.ts:65-70, 149-171` | Medium | **No** (transport is reusable; only the React binding is app-specific) | The browser-agnostic "send a string over a signaling channel" contract is generic. |
| R3 | **TURN credential cache + expiry logic** (`cachedIceServers`, `credentialPromise`, `getIceServers`, `resetCredentialCache`, `ensureCredentialArrived`) | `chat.ts:58-204` | **High** | **No** | This is a self-contained single-responsibility subsystem (cache + timeout + dedupe + reconnect invalidation) buried inside a 577-LOC file. Pure logic, no UI. Strong SRP violation. |
| R4 | **RTCPeerConnection lifecycle** (`createPeerConnection`, the 7 event handlers, `closeVideoCall`, transceiver stopping) | `chat.ts:206-225, 279-385, 539-577` | **High** | **No** | The most reusable, browser-specific logic in the codebase. Currently mixes engine + transport + logging. |
| R5 | **SDP negotiation** (`handleNegotiationNeededEvent`, `handleVideoOfferMsg`, `handleVideoAnswerMsg`, glare/role handling) | `chat.ts:279-498` | High | **No** | Same as R4 — this is the WebRTC call engine. |
| R6 | **ICE candidate trickling + early-candidate buffering** (`remoteIceCandidates`, `hasRemoteDescription`, drain-on-offer) | `chat.ts:49-50, 326-340, 458-470` | Medium-High | **No** | Subtly coupled to R4/R5; deserves to be part of the engine, not glued to a UI lib. |
| R7 | **Message routing** (`handleIncomingMessage` switch on `msg.action`) | `chat.ts:227-277` | Low | **No** | Generic dispatcher that should live with the protocol/chat package. |
| R8 | **Media device acquisition** (`navigator.mediaDevices.getUserMedia`, `mediaConstraints`) | `use-video-chat.ts:33-40, 174-190` | Low-Medium | **Partly** (the getUserMedia call), but **constraints + error mapping no** | Permission prompt + `<video>` ref binding is app-specific; the error taxonomy + constraints are portable. |
| R9 | **`<video>` srcObject DOM binding** (both cams) | `use-video-chat.ts:55-56, 74-91, 94-111, 122-125` | Low | **Yes** | Genuine view concern. |
| R10 | **Chat messages state** (`messages`, `handleChatMessage`, `sendChatMessage`) | `use-video-chat.ts:27-31, 63, 141-146, 220` + `chat.ts:387-395` | Low-Medium | **Partly** | UI list belongs here; the outbound `CHAT_MESSAGE` frame assembly belongs with the protocol package. |
| R11 | **User/stranger ID generation + accessors** (`generateUserId`, `getUserId`, `getStrangerId`, module-level `userId`/`strangerId`) | `chat.ts:20-39, 234` | Trivial | **No** — these are module-level singletons masquerading as functions | Worst SRP offender: identity is a side effect of message handling. Should be call/session state. |
| R12 | **Pending-match queuing** (`pendingCallerMatch`, `pendingVideoOffer`, flush in `setWebcamStream`) | `chat.ts:55-56, 78-91, 410-414, 439-445` | Medium | **No** | This is a race-condition bridge between R8 (async getUserMedia) and R4 (engine). Belongs with the call session, not as global state. |
| R13 | **Logging** (`console.log` scattered across both files: 30+ sites) | everywhere | Low | **Shared util** | Should be an injected/mocked logger for reuse + testing. |
| R14 | **Error UX via `alert()`** (`chat.ts:417, 504, 514`) | `chat.ts:500-519` | Trivial | **No** | Blocking the main thread w/ `alert` is a UX + testability smell; error raises should surface as events so the app chooses the toast. |

**SRP violations** (ranked):
1. `chat.ts` is a God Module mixing R3+R4+R5+R6+R7+R11+R12+R13+R14 — at least 7 responsibilities in one file.
2. `use-video-chat.ts` is also too broad: it owns the React state machine (R1), the DOM video binding (R9), the WebSocket lifecycle (R2), **and** drives the engine kickoff (R8).
3. The **setter-injection bridge** (`setSignaler`, `setOnTrackCallBack`, `setOnCloseVideoCallback`, `setOnChatMessageCallback`, `setWebcamStream`) couples both files through ~5 module-level mutable globals — a structural SRP violation (state ownership is split across a single logical object).

---

# 2. Frontend vs Shared Package

| Responsibility | Verdict | Reasoning (concrete) |
|---|---|---|
| R1 React FSM | **apps/frontend** | Uses `useState`/`useEffect`; tied to React. |
| R2 WS transport | **packages/webrtc** (transport interface) + **apps/frontend** (React binding) | The `ISignaler` interface (`chat.ts:93-95`) is already transport-agnostic by accident. Promote it to a shared port; an RN/desktop/bot client uses an entirely different transport. |
| R3 TURN cache | **packages/webrtc** | Pure logic, no React, no DOM. Reusable by every client. Concretely written today to receive `IceServer[]`+`expiresAt` over a `signaler.send` bridge — already abstracted. |
| R4 RTCPeerConnection lifecycle | **packages/webrtc** (with injected `RTCPeerConnection` ctor + `MediaStream`) | Since a 2nd client is on the roadmap, build the engine against `PeerConnectionFactory` injection so RN can substitute `react-native-webrtc`. The cost is ~3 extra lines of type plumbing — no extra package. |
| R5 SDP negotiation | **packages/webrtc** | Same: pure negotiation logic. |
| R6 ICE buffering | **packages/webrtc** | Belongs with R4/R5 in the engine. |
| R7 Message router | **packages/chat** | Decodes `ReceivedMessage` (`@repo/signaling-types`) — the message types are already shared; the dispatcher should be too. |
| R8 Media acquisition | **apps/frontend** (the `getUserMedia` call + `<video>` refs) ; **packages/webrtc** (`mediaConstraints` const + `handleGetUserMediaError` taxonomy) | The DOM/permission call is browser-only; the constraints/error categories are portable. |
| R9 `<video>` srcObject | **apps/frontend** | Genuine view concern. |
| R10 Chat state | UI list → **apps/frontend**; frame assembly (`CHAT_MESSAGE` msg) + inbound handling → **packages/chat** | UI list is React; the protocol frame is already typed in `@repo/signaling-types` (`ChatMessageInputMessage`/`OutputMessage`) and reusable. |
| R11 ID generation | **packages/chat** (as session state, not module singletons) | Identity is call/session state. Today it's a hidden global — fix it by lifting to the session. |
| R12 Pending-match queue | **packages/webrtc** (inside the engine) | The race between getUserMedia and an inbound offer is a WebRTC concern, not React's. |
| R13 Logging | **apps/frontend** injects a console logger by default; engine accepts an injected `Logger` interface | Lets tests mock logging deterministically. Tiny interface — lives in `packages/webrtc`. |
| R14 `alert()` errors | **apps/frontend** receives engine events and shows toasts | Engine raises typed errors/events; UI decides presentation. Eliminates Selenium/Playwright blocking issues. |

---

# 3. Cohesion

**Currently mixed together (the God module):** WebRTC engine (R4/R5/R6) + TURN cache (R3) + message router (R7) + chat protocol (R10) + session/identity state (R11) + logging (R13) + UI alerts (R14) — six unrelated domains in one file.

**Should stay together:**
- `PeerConnectionEngine` ← R4 + R5 + R6 + R12 (the ICE/SDP/PC lifecycle + pending-match race). Splitting these further would create tight temporal coupling between modules for no gain. These are *one* cohesive subsystem.
- `TurnCredentialCache` ← R3 alone. Pure, self-contained, weakly coupled to the engine.
- `ChatProtocol` (a.k.a. message router) ← R7 + R10 protocol frame + R11. Decodes wire messages + emits high-level session events; speaks to the engine via clearly defined events.

**Should be separated:**
- The WS transport (R2) belongs at the boundary, not inside the protocol layer. The current `setSignaler({ send: sendMessage })` bridge (`use-video-chat.ts:152`) is a tell: transport is already injected; just formalize it.
- DOM/media (R8, R9) and UI alerts (R14) belong in apps/frontend — they're presentation.

---

# 4. Coupling

| Smell | Evidence | Why it's bad |
|---|---|---|
| **Mutable module-level state** | `chat.ts:18-21, 41-68` — `myPeerConnection`, `webcamStream`, `strangerId`, `userId`, `role`, `cachedIceServers`, `credentialResolver/Rejecter`, `credentialTimer` | Implicit global. Two concurrent calls (or two React StrictMode mounts during dev) silently corrupt each other. Also makes the module un-unit-testable in isolation — every test interferes with the next. |
| **Hidden setter-injection bridge** | `setSignaler` / `setOnTrackCallBack` / `setOnCloseVideoCallback` / `setOnChatMessageCallback` / `setWebcamStream` (`chat.ts:78, 97-118, use-video-chat.ts:152-154, 182`) | Temporal coupling: the order of `setSignaler` → `setWebcamStream` matters. If `setWebcamStream` arrives first, `pending*` paths flip. Brittle. Should be constructor params. |
| **Feature envy** | `use-video-chat.ts:194-204` polls `getStrangerId()` from chat.ts to mirror state into React — the hook is reaching into chat.ts's private state | Indicates state ownership is wrong. `strangerId` should be **returned** by the engine as an event, not polled by a `useEffect` keyed on `stage` (which itself is another smell: `useEffect(setStrangerId, [stage])` reads chat state via the React stage — double-binding). |
| **Temporal coupling** | `hangUpCall(reason)` reads `strangerId` then calls `closeVideoCall(reason)` which nulls it — the comment at `chat.ts:526` documents the trap as a workaround | The captured-local-var dance is a band-aid; proper ownership (call session object carrying its `strangerId`) eliminates the ordering dependency. |
| **`pending*` race bridge** | `pendingCallerMatch` / `pendingVideoOffer` + `setWebcamStream` flush (`chat.ts:55-56, 78-91, 410-414, 439-445`) | Subtle state that encodes the "offer arrived before webcam ready" race. It is conceptually part of the engine but is wired to a *setter* invoked from a React `useEffect`. Tests cannot drive this path without mounting React. |
| **Shared default-secretary** | `signaler` is module-level (`chat.ts:46`). All functions share one connection; there is no way to express "this engine instance uses *that* signaler" | Same instance cannot support two concurrent sessions (no multi-tab) and cannot be constructed twice in tests without teardown. |

---

# 5. Proposed architecture

```
packages/
  webrtc/            # NEW — the call engine (R3, R4, R5, R6, R8-portable, R12, R13)
  chat/              # NEW — protocol + session FSM + identity (R7, R10, R11)
  signaling-types/   # unchanged (already correct)
  signaling-core/    # unchanged
  signaling-cf/      # unchanged
  ui/                # OPTIONAL (does not exist; do not pre-create)
apps/
  frontend/          # React shell + DOM + getUserMedia + toasts (R1, R8-call, R9, R14)
```

Why three "types-prefix" packages (`webrtc`, `chat`, `signaling-types`) and not `webrtc-core` only? Because they have **different reuse radii**: a headless bot may use only `chat`+`signaling-types` (no RTCPeerConnection); an admin console may use only `signaling-types`. Keeping them apart costs ~one extra package.json and pays off the moment the second client lands.

### `packages/webrtc` — the call engine
- **Purpose:** `RTCPeerConnection` lifecycle, ICE buffering, SDP negotiation, TURN cache, pending-match race.
- **Public API (proposed):**
  ```ts
  export interface PeerConnectionFactory {
    create(config: RTCConfiguration): RTCPeerConnection;
  }
  export interface Signaler {
    send(msg: Message): void;  // serializes via signaling-types
  }
  export interface PeerConnectionEvents {
    onRemoteTrack?(stream: MediaStream): void;
    onClose?(reason?: 'replacing' | 'stopping'): void;
    onIceServersExpired?: () => void;
    onError?(err: Error): void;       // replaces alert()
  }
  export class PeerConnectionEngine {
    constructor(opts: {
      factory: PeerConnectionFactory;  // platform seam
      signaler: Signaler;
      logger?: Logger;
      events: PeerConnectionEvents;
    });
    setLocalStream(stream: MediaStream): void;        // flushes pending*
    handleIncoming(msg: ReceivedMessage): Promise<void>;
    start(): Promise<void>;     // sends START
    hangUp(reason?: 'replacing' | 'stopping'): void;
    readonly strangerId: string | null;
    readonly role: 'caller' | 'callee' | null;
    dispose(): void;
  }
  export class TurnCredentialCache { /* getIceServers/resetCredentialCache, injected signaler */ }
  ```
- **Internal implementation:** collapse `createPeerConnection`, the 7 handlers, `invite`, `handleVideoOfferMsg`, `handleVideoAnswerMsg`, `handleNewICECandidateMsg`, `handleNegotiationNeededEvent`, `closeVideoCall`, `TurnCredentialCache` into this package. Methods become instance methods; module globals (`myPeerConnection`, `role`, `webcamStream`, `strangerId`, `remoteIceCandidates`, `hasRemoteDescription`, `pendingCallerMatch`, `pendingVideoOffer`) become private fields.
- **Dependencies:** `@repo/signaling-types`. Does **not** depend on `@repo/chat` (one-way: chat calls engine).
- **Why it deserves to exist:** it's the single most reusable artifact — would be duplicated wholesale in any second client. Also the engine is today's worst testability offender (mocks impossible due to global PC + global signaler).

### `packages/chat` — protocol + session FSM
- **Purpose:** wire-format decode of `ReceivedMessage`, route to engine, manage chat-message history event, identity-per-session.
- **Public API (proposed):**
  ```ts
  export class ChatSession {
    constructor(opts: { signaler: Signaler; engine: PeerConnectionEngine; logger?: Logger });
    handleIncomingMessage(msg: ReceivedMessage): Promise<void>;
    sendChat(content: string): void;
    onChatMessage(cb: (content: string, senderId: string) => void): () => void;
    readonly userId: string;
    readonly strangerId: string | null;
    dispose(): void;
  }
  export function generateUserId(): string;  // pure-ish (rng-based), injected if needed
  ```
- **Internal implementation:** `handleIncomingMessage`'s switch (`chat.ts:227-277`) is split: protocol cases (`CHAT_MESSAGE`, `HANG_UP`, `TURN_CREDENTIALS`, `INI_OFFER`, `VIDEO_*`) are routed to either the engine or the chat-message emitter. Outbound frame assembly (`sendChatMessage`, `startChat`, `hangUp` frame) also lives here.
- **Dependencies:** `@repo/signaling-types`, `@repo/webrtc`.
- **Why it deserves to exist:** a bot/admin client needs wire-format handling without `RTCPeerConnection`. Decoupling from the engine is cheap here and enables headless reuse.

### What stays app-specific in `apps/frontend/src/`
- `useVideoChat` hook — much slimmer: wires `react-use-websocket` → `Signaler`, instantiates `PeerConnectionEngine` (with browser `PeerConnectionFactory`) + `ChatSession`, exposes actions to the React FSM (`stage`), binds `<video>` refs to engine track events, surfaces errors as toasts (no `alert()`).
- `components/*`, `lib/utils.ts` (cn helper), `config.ts`.
- The `mediaConstraints` const + `handleGetUserMediaError` *error options* — moves to `packages/webrtc` as exported defaults; the app still calls `getUserMedia` itself and passes the stream.

---

# 6. Proposed module decomposition

(Mapping from current files; **state ownership** column shows who owns each piece of state after the refactor.)

| New module | Responsibility | Exported API | State owned | Replaces |
|---|---|---|---|---|
| `packages/webrtc/src/peer-connection-engine.ts` | RTC PC lifecycle, SDP, ICE | `PeerConnectionEngine` class | `myPeerConnection`, `role`, `webcamStream`, `strangerId`, `remoteIceCandidates`, `hasRemoteDescription`, `pendingCallerMatch`, `pendingVideoOffer` | `chat.ts:18-21, 41-56, 206-225, 279-498, 539-577` |
| `packages/webrtc/src/turn-credential-cache.ts` | TURN lookup + expiry + retry + dedupe | `TurnCredentialCache` class (+ `STUN_FALLBACK` const) | `cachedIceServers`, `cachedExpiresAt`, `credentialPromise`, `credentialResolver`, `credentialRejecter`, `credentialTimer` | `chat.ts:58-204` (verbatim, becomes instance methods) |
| `packages/webrtc/src/media-constraints.ts` | Default constraint preset + error taxonomy | `defaultMediaConstraints`, `mapGetUserMediaError` (returns an error category enum instead of side-effecting `alert`) | none | `use-video-chat.ts:33-40`, `chat.ts:500-519` |
| `packages/webrtc/src/types.ts` | `PeerConnectionFactory`, `Signaler`, `PeerConnectionEvents`, `Logger` | interfaces | none | `chat.ts:93-95` (ISignaler) |
| `packages/chat/src/chat-session.ts` | wire decode + dispatch + outbound frames | `ChatSession` class | `userId`, `onChatMessageCallback` | `chat.ts:20-39, 99-118, 227-277, 387-403, 521-537` |
| `apps/frontend/src/hooks/use-video-chat.ts` (slimmed) | React FSM + DOM binding + transport glue | `useVideoChat()` | `stage`, `isWebSocketConnected`, `messages`, refs | current `use-video-chat.ts` minus ~60% |
| `apps/frontend/src/lib/signaler-adapter.ts` | `react-use-websocket`'s `sendMessage` → `Signaler.send(Message)` | `makeReactWSSignaler(sendMessage)` | none | inline code in `use-video-chat.ts:151-153` |

**Why better:** each module has one reason to change. The engine has no React. The protocol has no DOM. The frontend only owns view + glue. Tests can now construct a `PeerConnectionEngine` with a fake `PeerConnectionFactory` returning a mock `RTCPeerConnection` — today that is literally impossible because the real `RTCPeerConnection` ctor + module globals are hard-wired.

---

# 7. State management

| Problem | Evidence | Fix |
|---|---|---|
| **Duplicated state**: `strangerId` exists as a module global in `chat.ts:20` AND as React state in `use-video-chat.ts:62`. | `use-video-chat.ts:193-195` polls `getStrangerId()` from chat, keyed on `stage` — double binding. | Single owner: `PeerConnectionEngine.strangerId` (getter); React keeps a derived mirror via subscription-only update, OR the frontend doesn't keep `strangerId` in state at all (renders `engine.strangerId` on event). |
| **Mutable module state** | `chat.ts:18-21, 41-68` — 11 globals | Privatize as instance fields inside `PeerConnectionEngine` / `TurnCredentialCache` / `ChatSession`. StrictMode double-mount then becomes safe (each mount = its own instance that cleans up via `dispose()`). |
| **Derived state** | `messages` array kept in React, derived from engine events; `strangerId ?? getUserId()` derived at return (`use-video-chat.ts:212`) — weird fallback | Keep `messages` in React (it *is* view state). Drop `getUserId()` fallback — `strangerId` should be `string | null`, and the component renders "no peer" explicitly. |
| **Encapsulation** | Every internal is exported or globally readable. | Everything except the three class ctors + their listed public methods becomes `private`. |
| **Lifetime** | No `dispose()` path; on unmount `webcamStream` leaks (mentioned in `chat.ts:560-563` comment) + `RTCPeerConnection` handlers keep firing. | Engine exposes `dispose()` that calls `closeVideoCall()` and stops the webcam stream tracks; the hook calls it on unmount. |

---

# 8. Public API review

Current public surface of `chat.ts`: 14 named exports including `setSignaler`, `setWebcamStream`, `setOnTrackCallBack`, `setOnCloseVideoCallback`, `setOnChatMessageCallback`, `resetCredentialCache`, `getStrangerId`, `getUserId` — **7 of them are setters/getters for global state**, which is how a hidden class should not be used.

Proposed changes:
- **Smaller interface**: replace the 14 free functions with 2 classes (`PeerConnectionEngine`, `ChatSession`) + 1 class (`TurnCredentialCache`) — each with ~5 methods, constructor-injected.
- **Better naming**: `setWebcamStream` → `setLocalStream` (it's not a webcam after RN reuse); `hangUpCall` → `hangUp`; `ISignaler` → `Signaler` (lifted to `packages/webrtc`). Prefix `I` removed.
- **Encapsulation**: drop `getStrangerId` / `getUserId` exports entirely; expose as readonly getters on the owning class.
- **Dependency inversion**: `Signaler` port (declared in `packages/webrtc` and re-exported from `packages/chat`); `PeerConnectionFactory` port (declared in `packages/webrtc`); `Logger` port. Three narrow ports replace zero explicit DIP today.

---

# 9. WebRTC architecture review

| Concern | Current state | Verdict | Recommendation |
|---|---|---|---|
| **PC lifecycle** | `createPeerConnection` adds 7 handlers imperative-style (`chat.ts:216-224`); `closeVideoCall` nulls each by hand (`chat.ts:545-551`) | Brittle-eslint-flavored but happens to be correct | Move to engine; consider `EventTarget`-style emission + `AbortController` for one-shot cleanup (`controller.abort()` detaches all listeners). |
| **ICE candidates** | Early-candidate queue (`remoteIceCandidates` + `hasRemoteDescription`, drain at `:461-470`) — correct and necessary | OK | Keep inside engine; the buffering decision shouldn't leak out. |
| **SDP negotiation** | Skips glare handling by relying on `role==='callee'` (`chat.ts:280` early-out in `handleNegotiationNeededEvent`). Defensible because server assigns roles (`@repo/signaling-core` `FindStranger`). | Acceptable, but **fragile: relies on a server invariant.** | Add an assertion-aware comment; consider `perfectNegotiation` only if server stops assigning roles. Don't add it speculatively. |
| **Media tracks** | `webcamStream.getTracks().forEach(t => pc.addTrack(t, stream))` repeated in `invite` (`:422-427`) AND `handleVideoOfferMsg` (`:472-476`) — dead classic addTrack (no `addTransceiver`). | Acceptable for POC; no renegotiation today. Fine to keep. | After extraction, this lives in one place inside the engine. Pure code-motion. |
| **Browser APIs** | `new RTCPeerConnection`, `new RTCSessionDescription`, `new RTCIceCandidate`, `navigator.mediaDevices.getUserMedia`, `alert`. Four hard browser coupling points. | Problem for the RN/desktop client said to be coming. | Inject ctor via `PeerConnectionFactory`; reuse `RTCSessionDescriptionInit` (DOM `RTCSessionDescription` isn't needed if you pass plain SDP objects). |
| **Permissions** | `getUserMedia` triggered in a `useEffect` on mount (`use-video-chat.ts:174-190`) — prompt fires before user clicks Start. UX smell. | UX bug | Move `getUserMedia` to `onStart`; show explicit permissions UI. (App-side change; beyond architecture scope but should be noted.) |
| **Renegotiation** | None supported — match-locked to single transceiver | Out of scope; leave it. | — |
| **Signaling boundaries** | Engine speaks `ReceivedMessage` directly; no transport interface — engine knows too much about the wire. | Needs `Signaler` port | Promote `ISignaler` to `packages/webrtc`. |

---

# 10. Testability

- **Current**: `vitest` is *not* installed anywhere (verified by explore agent); only Playwright E2E exists (`apps/frontend/e2e/peer-to-peer-call.spec.ts`). The engine at `chat.ts` **cannot be unit-tested** because every function reads or mutates module globals + constructs a real `RTCPeerConnection`. Mocking RTCPeerConnection from a test means stubbing `globalThis.RTCPeerConnection`, and the global signaler must be pre-set by `setSignaler` before the test function is called — fragile ordering.
- **Proposed**:
  - Inject `PeerConnectionFactory` → tests pass a fake constructor returning a stub `RTCPeerConnection` whose `createOffer`/`setLocalDescription`/etc. are spied. Deterministic, no headless Chrome needed.
  - Inject `Signaler` → tests assert outgoing messages without a real ws.
  - Inject `Logger` → tests capture logs.
  - `TurnCredentialCache` becomes pure async unit-testable: feed a fake `Signaler` returning a `TurnCredentialsMessage` after N ms, assert cache hit/miss/expiry behavior.
  - `ChatSession.handleIncomingMessage` becomes a router testable by throwing a `ReceivedMessage` at it and asserting outgoing frames + outbound chat events — pure logic, zero browser.
- **Recommended additions**: add `vitest` + a `vitest.config.ts` at repo root; add a `test` task to `turbo.json`; `@cloudflare/vitest-pool-workers` is not needed here (that's for the Worker side). Add unit tests alongside `packages/webrtc/src/__tests__` and `packages/chat/src/__tests__`.

---

# 11. Scalability

| Future client | Architecture change required | Notes |
|---|---|---|
| 2nd web app (admin/status) | **None** — `packages/webrtc` reused as-is. | Clean win. |
| React Native client | Implement a `ReactNativePeerConnectionFactory` (`react-native-webrtc`); reuse engine, chat, signaling-types. Don't render `<video>`, manage streams. | **This is exactly why `PeerConnectionFactory` is the right port.** |
| Desktop (Electron / Tauri) | Same as web — reuse web factory. | Win. |
| Server-side SFU/bot (no media, signaling-only) | Use only `packages/chat` + `signaling-types`; instantiate `PeerConnectionEngine` with a no-media factory that rejects `setLocalStream`. | Bot skips the engine entirely if it never handles media — that's why keeping `chat` separate from `webrtc` pays off. |
| Headless client (automated test runner / load test) | Use `chat` + `webrtc` with mock factories. | Load testing becomes possible once the engine is injectable. Today impossible due to global `RTCPeerConnection` ctor. |

**Pain point already visible**: today only **one** instance of `chat.ts`'s module state can exist per page (single peer connection alive at a time). Two-tab P2P, group calls, or admin testing of concurrent sessions cannot be supported without re-architecture — every global becomes per-instance.

---

# 12. Code smells (ranked by severity)

| # | Smell | Where | Severity |
|---|---|---|---|
| 1 | **God Module** | `chat.ts` — 7 responsibilities, 577 LOC | **Critical** |
| 2 | **Hidden mutable global state** | `chat.ts:18-21, 41-68` — 11 module-level mutables, the engine is a singleton-by-accident | **Critical** |
| 3 | **Inappropriate intimacy / setter injection bridge** | `setSignaler` / `setXxxCallback` / `setWebcamStream` between the two files | **High** |
| 4 | **Temporal coupling** | `hangUpCall` reads `strangerId` before `closeVideoCall` nulls it (`chat.ts:526-537`); the `pending*` flush order depends on `setWebcamStream` arriving after message handling | **High** |
| 5 | **Long Class (simulated)** | The quasi-class in `chat.ts` has ~30 functions mutating shared state | **High** |
| 6 | **Shotgun surgery (the bridge)** | Adding a new callback type requires edits in `chat.ts` (declare global + setter) *and* `use-video-chat.ts` (import + import + setter call *and* consumer state) | **Medium** |
| 7 | **Hidden side effect** | `getUserMedia` on mount (`use-video-chat.ts:174-190`) — permission prompt before user intent | **Medium** |
| 8 | **Feature envy** | `use-video-chat.ts:193-204` polls `getStrangerId()` from chat.ts to re-mirror into React state | **Medium** |
| 9 | **Large mutable state** | The TURN cache block alone has 6 mutable fields (`chat.ts:63-68`) | **Medium** |
| 10 | **`alert()` blocking main thread** | `chat.ts:417, 504, 514` — also masks test harnesses | **Medium** |
| 11 | **Inappropriate static-typed coupling to DOM** | `new RTCSessionDescription(...)` / `new RTCIceCandidate(...)` in handlers (`chat.ts:333, 452, 465, 495`) — many of these casts can be plain objects | **Low-Medium** |
| 12 | **Duplicated ID lookup** | `strangerId ?? getUserId()` (`use-video-chat.ts:212`) mixing identity semantics | **Low** |

---

# Deliverables

## 1. Executive summary
The "orchestration file" `use-video-chat.ts` is half of a **God module split across two files by a setter-injection bridge** (its sibling `lib/chat.ts`). The real problems are: ~14 module-level mutable globals acting as a hidden singleton; `RTCPeerConnection`/`MediaStream`/`alert` hard-coupling to the browser; 7 concerns in one 577-LOC file (engine, TURN cache, protocol, identity, logging, errors, race buffering); and a non-injectable design that prevents unit tests and blocks a **concrete, 6-month-away** second client. The fix is **moderate refactor + move shared logic into two new packages** (`webrtc`, `chat`), with the engine built platform-agnostic via an injected `PeerConnectionFactory` from day one — at near-zero extra cost.

## 2. Architecture assessment
- Types layer (`@repo/signaling-types`) is already correct and well-scoped.
- Server hexagonal layer (`@repo/signaling-core`, `@repo/signaling-cf`) is well-factored; the frontend simply never reuses it.
- The client side is the weak link — it should mirror the server's domain/adapter split: a **`webrtc` package** mirroring `signaling-core`'s "use-cases" model, and a **`chat` package** for protocol routing.

## 3. Responsibility map
See §1 table (14 responsibilities mapped to current location + R3-R14 of the verdict table).

## 4. What stays in `apps/frontend`
- React FSM (`stage`, `isWebSocketConnected`, `messages`).
- `react-use-websocket` binding + `makeReactWSSignaler` adapter (~20 LOC).
- `getUserMedia` permission call (moved to `onStart`, not auto-eager).
- `<video>` ref → `srcObject` binding.
- Error presentation (toasts; replacing `alert`).
- Default `PeerConnectionFactory` for browsers (the one-liner that `new RTCPeerConnection(config)`).
- All current components (`VideoChat`, `ControlBar`, `ChatPanel`, `VideoTile`, ui primitives).

## 5. What moves to `packages/`
- `packages/webrtc`: peer-connection engine, ICE buffering, SDP negotiation, TURN cache, pending-match race, default media constraints, `getUserMedia` error taxonomy, `Logger` port.
- `packages/chat`: `ReceivedMessage` dispatch, outbound frame assembly (`START`/`HANG_UP`/`VIDEO_*`/`CHAT_MESSAGE`), `userId`/`strangerId` session state, chat-message events.
- Reused as-is: `@repo/signaling-types`, `@repo/signaling-core`, `@repo/signaling-cf`.
- Do **not** pre-create `packages/ui` (it doesn't exist; AGENTS.md is stale here; the existing primitives are shadcn-style and one app's UX is fine to duplicate rather than abstract prematurely).

## 6. Proposed package tree
```
packages/
  webrtc/                # NEW
    src/
      peer-connection-engine.ts
      turn-credential-cache.ts
      media-constraints.ts
      types.ts           # PeerConnectionFactory, Signaler, Logger, PeerConnectionEvents
      index.ts
    package.json         # depends on @repo/signaling-types
  chat/                  # NEW
    src/
      chat-session.ts
      types.ts
      index.ts
    package.json         # depends on @repo/signaling-types, @repo/webrtc
  signaling-types/       # unchanged
  signaling-core/        # unchanged
  signaling-cf/          # unchanged
  typescript-config/     # unchanged
apps/
  frontend/              # slimmed hook + components
  (no other apps today)
```

## 7. Dependency diagram (ASCII)
```
                  @repo/signaling-types  (leaf)
                             ▲ ▲
                             │ │
        ┌────────────────────┘ └───────────────────┐
        │                    │                      │
 @repo/signaling-core        │ (no dep)              │
        ▲                    │                      │
        │                    │                      │
 @repo/signaling-cf          │                      │
                              │                      │
                       @repo/chat (NEW) ◄──── depends ────┐
                              │                          │
                              ▼ depends                  │
                       @repo/webrtc (NEW)                │
                              ▲                          │
                              │                          │
 @repo/frontend ──────────────┴─ (depends on @repo/webrtc, @repo/chat, @repo/signaling-types)
        │
        └─ (does NOT depend on signaling-core or signaling-cf)

 @repo/typescript-config  (dev dep of every TS package)
```
One-way dependency: `frontend → chat → webrtc → signaling-types`. No cycles. The server-bound packages (`signaling-core`, `signaling-cf`) stay on their own branch, exactly mirroring the symmetry: server domain + server adapters vs client domain + browser adapter.

## 8. Migration roadmap

| Step | Pr | Effort | Benefit | Risk | Merges alone? |
|---|---|---|---|---|---|
| **0. Add `vitest` + `turbo test` task + a couple of smoke tests in `signaling-core`** | High | S | Foundation for the rest; immediately lets you lock in current behavior | Low | Yes |
| **1. Create `packages/webrtc`: scaffold + move `TurnCredentialCache` (verbatim, just re-wrap as a class)** | High | M | Cracks open the God module from the easiest side; cache is fully pure logic with no DOM | Low (mechanical) | Yes |
| **2. Move `PeerConnectionEngine` into `packages/webrtc`** | High | M-L | Removes ~400 LOC from `chat.ts`; introduces `PeerConnectionFactory`/`Signaler` ports | Medium (regression risk on the SDP/PC paths; mitigate with E2E) | Yes (after step 1) |
| **3. Add `packages/chat`; move `ChatSession` + ID generation** | Med | M | Removes the rest of `chat.ts`; closes the protocol/engine split | Medium (router behavior changes) | Yes |
| **4. Slim `use-video-chat.ts`: instantiate engine+session instead of setters** | High | S | Removes the setter bridge; fixes StrictMode double-mount risk | Low | Depends on 2&3; merge together with one of them |
| **5. Replace `alert()` with an injected `onError` callback surfaced as a toast** | Low | XS | UX + E2E testability | Low | Yes, anytime |
| **6. Move `getUserMedia` from mount-time-effect to `onStart`-time** | Low-Med | XS-S | UX perm-prompt ordering fix | Low | Yes, anytime |
| **7. Delete stray `getUserId()` fallback; make `strangerId: string \| null` first-class** | Low | XS | Removes double-binding feature envy | Low | Yes |
| **8. Add unit tests for engine (fake factory) + session (fake signaler)** | High | M | Locks in regression scope after refactor | None | Yes |

The recommended merge sequence (minimizing regression window): **0 → 1 → 2 + 4 together → 3 → 8 → 5/6/7 in parallel**. Do NOT split step 2 into pieces; the engine's internal temporal coupling means moving it piecemeal would expose half-done global bridges. Step 4 must move with step 2 because the new bridge replaces the old setter-injection exactly at that boundary.

## 9. Risks
- **Regression risk concentrated in step 2** — the engine's ICE buffer + pending-match race + `hasRemoteDescription` flag rely on subtle ordering. Mitigation: keep Playwright E2E green on each PR; mirror field-for-field in the new class (pure code-motion first, refactor second).
- **`Pending-match` race hidden inside `setWebcamStream`** (`chat.ts:78-91`) — during step 2 the flush must move into `PeerConnectionEngine.setLocalStream`. If the dev forgets, tests pass (camera already ready) but the rare slow-`getUserMedia` regression strikes in production. Mitigation: add a vitest that constructs an engine, sends an offer *before* `setLocalStream`, ensures it is queued, then flushes.
- **StrictMode double-invoke** — after step 4 the engine/session will be constructed twice (dev-only); each must `dispose()`. Without proper `useEffect` cleanup, dev shows ghost peer connections. Mitigation: the engine's `dispose()` must null handlers + `pc.close()`; covered by step 8 tests.
- **Signaling invariant drift** — the SDP-glare-free shortcut (`role === 'callee'` early-out) depends on `FindStranger` always assigning roles; if a future server change drops that, the caller-side `onnegotiationneeded` may misfire. Mitigation: add a runtime assertion in the engine + a server-side test.
- **Backwards compatibility of `@repo/signaling-types`** — the existing `HangUpMessage` does NOT extend `Message` (`messages.ts:69-72`); cleaning that up later is a separate concern and shouldn't be bundled with this refactor.

## 10. Maintainability score: **5/10**
Working code, clever non-obvious correctness, but untestable, two-file God module with hidden global state. The architecture doesn't reflect the existing server-side hexagonal design — the client is the weakest link in the monorepo.

## 11. Scalability score: **4/10**
Cannot support a second concurrent session, a second client (RN/desktop/bot) without re-deriving everything, load/headless testing, or StrictMode in React. Every concern except the existing `signaling-types` package is browser-bound.

## 12. Overall architecture score: **6/10**
Excellent at the *types* and *server* layers; weak at the *client* layer. The trap is that the client layer was "good enough for POC" and is now one self-reinforcing 577-LOC file away from collapse.

## 13. Final recommendation
**Move shared logic into packages** (moderate split + extract two packages).

Not "light refactor" (the global state is fatal for the next 6-month client), not "major redesign" (the existing types and server side should be left untouched, and the engine logic is fundamentally correct — pure code-motion is mostly sufficient). The proposed `packages/webrtc` + `packages/chat` extraction, with a platform-injected `PeerConnectionFactory`, directly addresses the concrete second-client roadmap flagged during the review while remaining strictly pragmatic — no premature third package, no speculative `ui` package, no over-abstracted Hexagon on the client.
