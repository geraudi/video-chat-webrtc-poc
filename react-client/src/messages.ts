export interface Message {
  type: string;
}

export interface SendVideoOffertMessage extends Message {
  type: 'video-offer',
  id: string,
  sdp: RTCSessionDescription
}

export interface ReceiveVideoOffertMessage extends Message {
  type: 'video-offer',
  id: string,
  targetId: string,
  sdp: RTCSessionDescription
}

export interface VideoAnswerMessage extends Message {
  type: 'video-answer',
  id: string,
  targetId: string,
  sdp: RTCSessionDescription
}

export interface NewIceCandidateMessage extends Message {
  type: 'new-ice-candidate',
  targetId: string,
  candidate: RTCIceCandidate
}

export interface HangUpMessage {
  type: 'hang-up',
  id: string,
  targetId: string
}
