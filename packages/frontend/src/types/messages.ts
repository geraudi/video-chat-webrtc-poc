export enum Actions {
  VIDEO_OFFER = 'videoOffer',
  VIDEO_ANSWER = 'videoAnswer',
  NEW_ICE_CANDIDATE = 'newIceCandidate',
  HANG_UP = 'hangUp'
}

export interface Message {
  action: string;
}

export interface RequestConnectionIdMessage extends Message {
  action: 'requestId';
}

export interface VideoOffertInputMessage extends Message {
  action: Actions.VIDEO_OFFER,
  sdp: RTCSessionDescription,
  senderId: string,
}

export interface VideoOffertOutputMessage extends Message {
  action: Actions.VIDEO_OFFER,
  sdp: RTCSessionDescription
}

export interface VideoAnswerInputMessage extends Message {
  action: Actions.VIDEO_ANSWER,
  sdp: RTCSessionDescription,
  strangerId: string,
}

export interface VideoAnswerOutputMessage extends Message {
  action: Actions.VIDEO_ANSWER,
  sdp: RTCSessionDescription,
  senderId: string,
}

export interface NewIceCandidateMessage extends Message {
  action: Actions.NEW_ICE_CANDIDATE,
  strangerId: string,
  candidate: RTCIceCandidate
}

export interface HangUpMessage {
  action: Actions.HANG_UP,
  strangerId: string
}
