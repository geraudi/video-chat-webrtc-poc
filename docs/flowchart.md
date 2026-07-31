# WebRTC Video Chat Flow Chart

## Architecture Overview

```mermaid
graph TB
    subgraph ClientA["🖥️ Peer A (Browser)"]
        A1["Click 'Start'"]
        A2["send START<br/>WebSocket"]
        A3["recv initOffer<br/>role=caller"]
        A4["getUserMedia<br/>webcam + mic"]
        A5["create RTCPeerConnection"]
        A6["add local tracks"]
        A7["createOffer → SDP"]
        A8["setLocalDescription<br/>local offer"]
        A9["send videoOffer<br/>WebSocket"]
        A10["recv ICE candidates"]
        A11["add remote ICE"]
        A12["recv videoAnswer<br/>SDP answer"]
        A13["setRemoteDescription<br/>remote answer"]
        A14["📹 Remote Video"]
        A15["hangUpCall"]
    end

    subgraph Server["🔧 Signaling Server<br/>Cloudflare Worker + Durable Object"]
        S1["webSocketMessage<br/>START dispatch"]
        S2["SQLite Lookup:<br/>WHERE is_available=1"]
        S3["Match found!"]
        S4["Forward SDP offer<br/>to callee"]
        S5["Forward SDP answer<br/>to caller"]
        S6["Forward ICE candidate<br/>to peer"]
        S7["Forward hangUp<br/>to peer"]
    end

    subgraph DB["🗄️ DO SQLite<br/>connections table"]
        D1["Connection Record<br/>id | is_available"]
    end

    subgraph ClientB["🖥️ Peer B (Browser)"]
        B1["recv initOffer<br/>role=callee"]
        B2["getUserMedia<br/>webcam + mic"]
        B3["create RTCPeerConnection"]
        B4["add local tracks"]
        B5["recv videoOffer<br/>SDP offer"]
        B6["setRemoteDescription<br/>remote offer"]
        B7["createAnswer → SDP"]
        B8["setLocalDescription<br/>local answer"]
        B9["send videoAnswer<br/>WebSocket"]
        B10["recv ICE candidates"]
        B11["add remote ICE"]
        B12["📹 Remote Video"]
        B13["hangUpCall"]
    end

    A1 --> A2
    A2 --> S1
    S1 --> S2
    S2 --> D1
    D1 --> S3
    S3 --> S4
    S4 --> B5
    
    A9 --> S4
    S4 --> B5
    B5 --> B6
    B6 --> B7
    B7 --> B8
    B8 --> B9
    B9 --> Server
    S5 --> A12
    A12 --> A13
    A13 --> A14

    style ClientA fill:#0f3460,stroke:#e94560,stroke-width:2px,color:#fff
    style Server fill:#1a1a2e,stroke:#533483,stroke-width:2px,color:#fff
    style DB fill:#16213e,stroke:#e94560,stroke-width:2px,color:#fff
    style ClientB fill:#0f3460,stroke:#e94560,stroke-width:2px,color:#fff
```

---

## Message Flow Details

| Step | Message | Direction | Description |
|------|---------|-----------|-------------|
| 1 | `START` | Client → Server | Request peer matching via WebSocket |
| 2 | `initOffer + role` | Server → Both Peers | Assign roles (caller/callee) with strangerId |
| 3 | `videoOffer (SDP)` | Caller → Server → Callee | SDP offer with media capabilities |
| 4 | `videoAnswer (SDP)` | Callee → Server → Caller | SDP answer accepting connection |
| 5 | `newIceCandidate` | Both → Server → Both | NAT traversal ICE candidates exchanged |
| 6 | `video stream` | Peer ↔ Peer (P2P) | Direct WebRTC media stream (UDP) |
| 7 | `hangUp` | Either → Server → Other | Terminate call and cleanup |

---

## Detailed Sequence Diagram

```mermaid
sequenceDiagram
    participant A as Peer A (Caller)
    participant GW as Cloudflare Worker + DO<br/>Signaling Server
    participant DB as DO SQLite
    participant B as Peer B (Callee)

    Note over A,B: Phase 1: Peer Discovery Matching
    
    A->>GW: WebSocket connect
    GW-->>A: Connected
    
    A->>DB: INSERT connection (id, is_available=0)
    
    A->>GW: WebSocket START
    activate GW
    GW->>DB: SELECT FROM connections<br/>WHERE is_available=1
    DB-->>GW: Available peer B found
    
    alt Peer B available
        GW->>DB: UPDATE set is_available=0
        GW-->>A: initOffer role=caller strangerId=B
        GW-->>B: initOffer role=callee strangerId=A
    else No peer available
        GW->>DB: UPDATE set is_available=1
        GW-->>A: Available (waiting for match)
    end
    deactivate GW

    Note over A,B: Phase 2: WebRTC Negotiation SDP Exchange
    
    A->>A: getUserMedia() webcam + mic
    A->>A: createRTCPeerConnection()
    A->>A: addTrack(webcam, mic)
    
    B->>B: getUserMedia() webcam + mic
    B->>B: createRTCPeerConnection()

    A->>A: createOffer() → SDP Offer
    A->>A: setLocalDescription(offer)
    
    A->>GW: videoOffer senderId=A sdp=...
    activate GW
    GW-->>B: videoOffer senderId=A sdp=...
    deactivate GW

    B->>B: setRemoteDescription(offer)
    B->>B: createAnswer() → SDP Answer
    B->>B: setLocalDescription(answer)
    
    B->>GW: videoAnswer senderId=A sdp=...
    activate GW
    GW-->>A: videoAnswer strangerId=B sdp=...
    deactivate GW

    A->>A: setRemoteDescription(answer)
    
    Note over A,B: Phase 3: ICE Candidate Exchange
    
    A->>GW: newIceCandidate candidate=...
    GW-->>B: newIceCandidate candidate=... strangerId=A
    
    B->>GW: newIceCandidate candidate=...
    GW-->>A: newIceCandidate candidate=... strangerId=B

    Note over A,B: Phase 4: P2P Connection Established
    
    A->>B: WebRTC Media Stream (UDP/P2P)
    B->>A: WebRTC Media Stream (UDP/P2P)

    Note over A,B: Phase 5: Call Termination
    
    A->>GW: hangUp strangerId=B
    GW-->>B: hangUp strangerId=A
    
    A->>A: closeVideoCall() cleanup
    B->>B: closeVideoCall() cleanup
```

---

## Durable Object Message Dispatch Reference

The `SignalingDO.webSocketMessage()` in `packages/signaling-cf/src/signaling-do.ts` dispatches on the message `action`:

### Peer Matching (`START`)
- **Logic**: Run `FindStranger` — query SQLite for an available peer (`WHERE is_available=1`). If found, mark both unavailable and send `initOffer` to both with role assignment. Otherwise, set sender as `is_available=1` to wait.

### SDP Forwarding (`videoOffer` / `videoAnswer`)
- **Logic**: Run `ForwardMessage` — look up the target connectionId in SQLite and `ws.send()` the message in-process via `CloudflareSignalingGateway`.

### ICE Candidate Forwarding (`newIceCandidate`)
- **Route**: `newIceCandidate` action
- **Logic**: Same as SDP forwarding — forward the candidate to the peer's WebSocket.

### Call Termination (`hangUp`)
- **Route**: `hangUp` action
- **Logic**: Notify peer of hangup, clean up the connection record.

### Connection Lifecycle (`fetch()` / `webSocketClose()`)
- **Logic**: `fetch()` accepts the WebSocket upgrade, generates the connectionId and runs `ConnectPeer`; `webSocketClose()` runs `DisconnectPeer` to remove the record from the `connections` table.