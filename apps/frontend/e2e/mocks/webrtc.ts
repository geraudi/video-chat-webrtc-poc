/**
 * WebRTC API mocks for headless browser testing.
 * 
 * This module provides the script content to inject into browser contexts
 * to mock WebRTC APIs. This allows testing the signaling and connection
 * establishment flow without real camera/mic access.
 */

export const webrtcMockScript = `
// Mock getUserMedia to return a dummy stream
const dummyStream = {
  id: 'dummy-stream-id',
  active: true,
  onremotetracks: null,
  getTracks: () => [],
  addTrack: () => {},
  removeTrack: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
} as unknown as MediaStream;

(globalThis as any).navigator.mediaDevices = {
  getUserMedia: async () => dummyStream,
};

// Mock RTCPeerConnection
class MockRTCPeerConnection {
  config?: any;
  iceCandidates: any[] = [];
  _localDescription: any = null;
  _remoteDescription: any = null;
  oniceconnectionstatechange: any = null;
  ontrack: any = null;
  onicecandidate: any = null;
  onconnectionstateChange: any = null;

  constructor(config: any) {
    this.config = config;
  }

  get iceConnectionState(): string { return 'connected'; }
  get connectionState(): string { return 'connected'; }
  get localDescription(): any { return this._localDescription; }
  get remoteDescription(): any { return this._remoteDescription; }

  async createOffer(): Promise<any> {
    this._localDescription = {
      type: 'offer',
      sdp: 'v=0\\r\\no=- 1234567890 1 IN IP4 127.0.0.1\\r\\ns:-\\r\\nt=0 0\\r\\nm=audio 9 UDP/TLS/SRTP/AES_256_GCM\\r\\na=mid:0\\r\\na=sctp-port:5000\\r\\n',
    };
    return this._localDescription;
  }

  async createAnswer(): Promise<any> {
    this._localDescription = {
      type: 'answer',
      sdp: 'v=0\\r\\no=- 9876543210 1 IN IP4 127.0.0.1\\r\\ns:-\\r\\nt=0 0\\r\\nm=audio 9 UDP/TLS/SRTP/AES_256_GCM\\r\\na=mid:0\\r\\na=sctp-port:5000\\r\\n',
    };
    return this._localDescription;
  }

  async setLocalDescription(desc: any): Promise<void> {
    this._localDescription = desc;
  }

  async setRemoteDescription(desc: any): Promise<void> {
    this._remoteDescription = desc;
  }

  async addIceCandidate(candidate: any): Promise<boolean> {
    this.iceCandidates.push(candidate);
    return true;
  }

  addTrack(track: any, stream: any): any {
    if (this.ontrack) {
      this.ontrack({ track, streams: [stream] });
    }
    return track;
  }

  getSenders(): any[] { return []; }
}

(MockRTCPeerConnection as any).generateCertificate = async () => {};
(window as any).RTCPeerConnection = MockRTCPeerConnection;

// Mock RTCSessionDescription
class MockRTCSessionDescription {
  type: string;
  sdp: string;

  constructor(desc: any) {
    this.type = desc.type;
    this.sdp = desc.sdp;
  }

  toJSON(): any {
    return { type: this.type, sdp: this.sdp };
  }
}

(window as any).RTCSessionDescription = MockRTCSessionDescription;

// Mock RTCDTMFSender
class MockRTCDTMFSender {
  get canInsertDTMF(): boolean { return false; }
  get toneBuffer(): string { return ''; }
  insertTone(): void {}
  ontonechange: any = null;
}

(window as any).RTCDTMFSender = MockRTCDTMFSender;

// Mock RTCSctpTransport
class MockRTCSctpTransport {
  get maxMessageSize(): number { return 0; }
  get packetsInRecovery(): boolean { return false; }
  get state(): string { return 'connected'; }
  get maxChannels(): number { return 0; }
  get transport(): any { return null; }
  onstatechange: any = null;
}

(window as any).RTCSctpTransport = MockRTCSctpTransport;

// Mock RTCIceCandidate
class MockRTCIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;

  constructor(candidateInitDict?: any) {
    this.candidate = candidateInitDict?.candidate || '';
    this.sdpMid = candidateInitDict?.sdpMid || null;
    this.sdpMLineIndex = candidateInitDict?.sdpMLineIndex || null;
  }
}

(window as any).RTCIceCandidate = MockRTCIceCandidate;
`;

/**
 * Default WebRTC configuration used by mocks.
 */
export const defaultMockConfig = {
  connectionState: 'connected' as const,
  iceConnectionState: 'connected' as const,
  sctpState: 'connected' as const,
};