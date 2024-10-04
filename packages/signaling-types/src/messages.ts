/* eslint-disable no-unused-vars */
export enum Actions {
  VIDEO_OFFER = 'videoOffer',
  VIDEO_ANSWER = 'videoAnswer',
  NEW_ICE_CANDIDATE = 'newIceCandidate',
  HANG_UP = 'hangUp',
  START = 'start',
  INI_OFFER = 'initOffer',
}

export interface Message {
  action: Actions;
}

export interface StartMessage extends Message {
  action: Actions.START;
}

export interface InitOfferMessage extends Message {
  action: Actions.INI_OFFER;
  role: 'caller' | 'callee';
  strangerId: string;
}

export interface VideoOfferInputMessage extends Message {
  action: Actions.VIDEO_OFFER;
  sdp: RTCSessionDescription;
  senderId: string;
}

export interface VideoOfferOutputMessage extends Message {
  action: Actions.VIDEO_OFFER;
  sdp: RTCSessionDescription;
  strangerId: string;
}

export interface VideoAnswerInputMessage extends Message {
  action: Actions.VIDEO_ANSWER;
  sdp: RTCSessionDescription;
  strangerId: string;
}

export interface VideoAnswerOutputMessage extends Message {
  action: Actions.VIDEO_ANSWER;
  sdp: RTCSessionDescription;
  senderId: string;
}

export interface NewIceCandidateMessage extends Message {
  action: Actions.NEW_ICE_CANDIDATE;
  strangerId: string;
  candidate: RTCIceCandidate;
}

export interface HangUpMessage {
  action: Actions.HANG_UP;
  strangerId: string;
}

export type ReceivedMessage =
  | InitOfferMessage
  | VideoOfferInputMessage
  | VideoAnswerInputMessage
  | NewIceCandidateMessage
  | HangUpMessage
