## Click "Next" Button Flow Analysis

### Entry Point

When the user clicks "Next" (visible only in `connected` stage), the call chain is:

```
Button onClick → onNext (use-video-chat.ts) → hangUpCall() + startChat() (chat.ts)
```

---

### Step-by-Step Breakdown

#### 1. UI State Cleanup (use-video-chat.ts, line 96-109)

```typescript
const onNext = useCallback(() => {
  // 1a. Clear stranger video element
  if (strangerCam.current) {
    strangerCam.current.srcObject = null;
    strangerCam.current.src = '';
  }
  
  // 1b. Hang up via signaling
  hangUpCall();
  
  // 1c. Start new peer search
  startChat();
  setStage('searching');
}, []);
```

#### 2. WebSocket API Calls

**First: `hangUpCall()` sends `HANG_UP` message** (chat.ts line 309-317)
```typescript
const hangUpMessage: HangUpMessage = {
  action: Actions.HANG_UP,
  strangerId: strangerId  // e.g., "abc123"
};
sendToServer(hangUpMessage);  // → WebSocket JSON: {"action": "HANG_UP", "strangerId": "abc123"}
```

**Server-side handling** (packages/signaling-cf/src/signaling-do.ts, `webSocketMessage`):
- Receives `HANG_UP` with `strangerId`
- Looks up stranger's connectionId from the Durable Object SQLite storage
- Forwards `HANG_UP` message to stranger's WebSocket connection
- Marks current connection as unavailable in the DB

**Second: `startChat()` sends `START` message** (chat.ts line 188-193)
```typescript
const startMessage: StartMessage = {
  action: Actions.START
};
sendToServer(startMessage);  // → WebSocket JSON: {"action": "START"}
```

**Server-side handling** (packages/signaling-cf/src/signaling-do.ts, `webSocketMessage`):
- Receives `START`
- Marks connection as available in the Durable Object SQLite storage (`is_available = 1`)
- Looks for another available peer
- If found: sends `initOffer` to both peers with roles and strangerId
- If not found: waits until someone else becomes available

#### 3. WebRTC Actions

**Phase A: Cleanup of Current Call** (inside `hangUpCall()` → `closeVideoCall()`)

1. Removes all event listeners from RTCPeerConnection:
   - `ontrack`, `onicecandidate`, `oniceconnectionstatechange`, `onsignalingstatechange`, `onicegatheringstatechange`, `onnegotiationneeded`

2. Stops all transceivers: `myPeerConnection.getTransceivers().forEach(t => t.stop())`

3. Closes peer connection: `myPeerConnection.close()`

4. Resets state: `myPeerConnection = null`, `strangerId = null`, `hasRemoteDescription = false`

5. Calls `onCloseVideoCallback()` → triggers `setStage('searching')` in the hook

**Phase B: New Call Establishment (after server matches peers)**

When `initOffer` arrives from server:
- **Caller role**: 
  1. `createPeerConnection()` - creates new RTCPeerConnection with Google STUN
  2. Adds local webcam tracks to connection
  3. Triggers `onnegotiationneeded` event
  
  4. `createOffer()` → generates SDP offer
  5. `setLocalDescription()` → sets local SDP
  6. Sends `VIDEO_OFFER` via WebSocket with SDP

- **Callee role**:
  1. Receives `initOffer` with `role: 'callee'`
  2. Waits for `VIDEO_OFFER` from caller
  
  3. `setRemoteDescription()` → sets remote SDP from offer
  4. Stores ICE candidates (queued since no local description yet)
  5. Adds webcam tracks
  6. `createAnswer()` → generates SDP answer
  7. `setLocalDescription()` → sets local SDP
  8. Sends `VIDEO_ANSWER` via WebSocket with SDP

**Phase C: ICE Candidate Exchange**

Both peers exchange ICE candidates via `NEW_ICE_CANDIDATE` WebSocket messages:
- Each peer sends its ICE candidates through WebSocket
- Remote peer calls `addIceCandidate()` on their RTCPeerConnection
- NAT traversal progresses → connection established

**Phase D: Media Stream Received**

When remote video track arrives:
1. `ontrack` event fires
2. `onunmute` callback triggers
3. `setStage('connected')` → UI transitions to connected state
4. Remote video displays in strangerCam element

---

### Summary Diagram

```
Click "Next"
    │
    ├─ 1. Hang Up Current Call
    │   ├─ WebSocket: HANG_UP → Server
    │   ├─ Server forwards HANG_UP to stranger
    │   └─ WebRTC: Close RTCPeerConnection, stop transceivers
    │
    ├─ 2. Start New Peer Search
    │   ├─ WebSocket: START → Server (mark available)
    │   ├─ Server finds matching peer
    │   ├─ Server sends initOffer to both peers
    │   └─ [Peer-specific WebRTC flow begins]
    │       ├─ Caller: createOffer → VIDEO_OFFER → Server
    │       ├─ Callee: receives VIDEO_OFFER → createAnswer → VIDEO_ANSWER → Server
    │       └─ Both: exchange NEW_ICE_CANDIDATE via Server
    │
    └─ 3. Connection Established
        ├─ ontrack fires → setStage('connected')
        └─ Video streams flow P2P
```