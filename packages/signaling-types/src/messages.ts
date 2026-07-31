/* eslint-disable no-unused-vars */
export enum Actions {
  VIDEO_OFFER = 'videoOffer',
  VIDEO_ANSWER = 'videoAnswer',
  NEW_ICE_CANDIDATE = 'newIceCandidate',
  HANG_UP = 'hangUp',
  START = 'start',
  INI_OFFER = 'initOffer',
  REQUEST_TURN_CREDENTIALS = 'requestTurnCredentials',
  TURN_CREDENTIALS = 'turnCredentials',
  CHAT_MESSAGE = 'chatMessage'
}

/**
 * Minimal ICE server shape (subset of RTCIceServer). Declared here rather than
 * importing the DOM RTCIceServer type so the backend — a Node package — does
 * not depend on the DOM lib.
 */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
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
  senderId: string;
}

export interface VideoAnswerOutputMessage extends Message {
  action: Actions.VIDEO_ANSWER;
  sdp: RTCSessionDescription;
  strangerId: string;
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

export interface ChatMessageInputMessage extends Message {
  action: Actions.CHAT_MESSAGE;
  content: string;
  strangerId: string;
}

export interface ChatMessageOutputMessage extends Message {
  action: Actions.CHAT_MESSAGE;
  content: string;
  senderId: string;
}

export interface RequestTurnCredentialsMessage extends Message {
  action: Actions.REQUEST_TURN_CREDENTIALS;
}

export interface TurnCredentialsMessage extends Message {
  action: Actions.TURN_CREDENTIALS;
  iceServers: IceServer[];
  expiresAt: number;
}

export type ReceivedMessage =
  | InitOfferMessage
  | VideoOfferInputMessage
  | VideoAnswerInputMessage
  | NewIceCandidateMessage
  | HangUpMessage
  | TurnCredentialsMessage
  | ChatMessageOutputMessage;
