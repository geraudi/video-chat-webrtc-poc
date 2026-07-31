interface RTCSessionDescription {
  type: RTCSdpType;
  sdp: string;
  toJSON(): RTCSessionDescriptionInit;
}

type RTCSdpType = 'answer' | 'offer' | 'pranswer' | 'rollback';

interface RTCIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment: string | null;
  toJSON(): RTCIceCandidateInit;
}
