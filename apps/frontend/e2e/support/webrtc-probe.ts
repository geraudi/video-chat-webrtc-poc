import type { BrowserContext, Page } from '@playwright/test';

/**
 * Passive instrumentation of the REAL WebRTC stack.
 *
 * `src/lib/chat.ts` keeps its `RTCPeerConnection` in module scope, so a test
 * has no handle on it. Instead of adding a test hook to production code, the
 * probe subclasses the native constructor and registers every instance it
 * creates on `window.__peerConnections`.
 *
 * Nothing is stubbed, replaced or short-circuited: SDP, ICE, DTLS and media all
 * run through Chromium's real implementation. The probe only keeps references
 * so the test can read `connectionState`, the negotiated descriptions and
 * `getStats()`.
 */

declare global {
  interface Window {
    /** Every RTCPeerConnection the app has created, oldest first. */
    __peerConnections?: RTCPeerConnection[];
  }
}

/**
 * Register the probe on a context. Must be called before the first navigation
 * so the init script runs ahead of the app bundle.
 */
export async function installWebRtcProbe(
  context: BrowserContext
): Promise<void> {
  await context.addInitScript(() => {
    const NativePeerConnection = window.RTCPeerConnection;

    class ProbedPeerConnection extends NativePeerConnection {
      constructor(...args: ConstructorParameters<typeof NativePeerConnection>) {
        super(...args);
        window.__peerConnections = window.__peerConnections ?? [];
        window.__peerConnections.push(this);
      }
    }

    window.RTCPeerConnection = ProbedPeerConnection;
  });
}

/** State of the peer connection currently in use, as reported by the browser. */
export interface PeerConnectionState {
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  signalingState: RTCSignalingState;
  /** 'offer' on the caller, 'answer' on the callee. */
  localDescriptionType: RTCSdpType | null;
  /** Mirror image of localDescriptionType once negotiation completed. */
  remoteDescriptionType: RTCSdpType | null;
}

/**
 * Read the state of the app's current peer connection (the most recent one —
 * a new connection is built for every match). Returns null before the app has
 * created any, so callers can poll from the very start of a test.
 */
export function readPeerConnection(
  page: Page
): Promise<PeerConnectionState | null> {
  return page.evaluate(() => {
    const peerConnection = window.__peerConnections?.at(-1);
    if (!peerConnection) return null;

    return {
      connectionState: peerConnection.connectionState,
      iceConnectionState: peerConnection.iceConnectionState,
      signalingState: peerConnection.signalingState,
      localDescriptionType: peerConnection.localDescription?.type ?? null,
      remoteDescriptionType: peerConnection.remoteDescription?.type ?? null
    };
  });
}

/** The ICE candidate pair the browser actually transmits over. */
export interface SelectedCandidatePair {
  localCandidateType: string | null;
  remoteCandidateType: string | null;
}

/** Live transport facts pulled from the standard `getStats()` report. */
export interface ConnectionStats {
  /** Null until ICE has nominated a working pair. */
  selectedCandidatePair: SelectedCandidatePair | null;
  /** RTP bytes received from the peer, summed over all inbound streams. */
  bytesReceived: number;
}

/**
 * Read transport-level evidence that the two peers are exchanging real media:
 * the nominated ICE candidate pair and the inbound RTP byte count.
 *
 * Uses `getStats()` rather than `<video>.currentTime` so the assertions do not
 * depend on Chrome's autoplay policy.
 */
export function readConnectionStats(
  page: Page
): Promise<ConnectionStats | null> {
  return page.evaluate(async () => {
    const peerConnection = window.__peerConnections?.at(-1);
    if (!peerConnection) return null;

    const report = await peerConnection.getStats();

    const candidateType = (id: string | undefined): string | null => {
      if (!id) return null;
      return report.get(id)?.candidateType ?? null;
    };

    const describePair = (pair: {
      localCandidateId?: string;
      remoteCandidateId?: string;
    }) => ({
      localCandidateType: candidateType(pair.localCandidateId),
      remoteCandidateType: candidateType(pair.remoteCandidateId)
    });

    const transports: { selectedCandidatePairId?: string }[] = [];
    const succeededPairs: {
      localCandidateId?: string;
      remoteCandidateId?: string;
    }[] = [];
    let bytesReceived = 0;

    report.forEach(entry => {
      switch (entry.type) {
        case 'transport':
          transports.push(entry);
          break;
        case 'candidate-pair':
          if (entry.state === 'succeeded' && entry.nominated) {
            succeededPairs.push(entry);
          }
          break;
        case 'inbound-rtp':
          bytesReceived += entry.bytesReceived ?? 0;
          break;
      }
    });

    // The transport's pointer is authoritative; the nominated+succeeded pair is
    // a fallback for reports that omit it.
    const selectedPairId = transports.find(
      transport => transport.selectedCandidatePairId
    )?.selectedCandidatePairId;
    const selectedPair =
      (selectedPairId ? report.get(selectedPairId) : undefined) ??
      succeededPairs[0];

    return {
      selectedCandidatePair: selectedPair ? describePair(selectedPair) : null,
      bytesReceived
    };
  });
}
