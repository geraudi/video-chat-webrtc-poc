import type { IceServer } from '@repo/signaling-types/messages';
import {
  Actions,
  type HangUpMessage,
  type InitOfferMessage,
  type Message,
  type NewIceCandidateMessage,
  type ReceivedMessage,
  type TurnCredentialsMessage,
  type VideoAnswerInputMessage,
  type VideoAnswerOutputMessage,
  type VideoOfferInputMessage,
  type VideoOfferOutputMessage
} from '@repo/signaling-types/messages';
import { mapGetUserMediaError } from './media-constraints';
import { TurnCredentialCache } from './turn-credential-cache';
import { type Signaler, sendToServer } from './types';

export interface PeerConnectionFactory {
  create(config: RTCConfiguration): RTCPeerConnection;
}

export interface Logger {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface PeerConnectionEvents {
  onRemoteTrack?: (stream: MediaStream) => void;
  onClose?: (reason?: 'replacing' | 'stopping') => void;
  onIceServersExpired?: () => void;
  onError?: (err: Error) => void;
  onStrangerIdChange?: (strangerId: string | null) => void;
}

export class PeerConnectionEngine {
  private myPeerConnection: RTCPeerConnection | null = null;
  private webcamStream: MediaStream | null = null;
  private strangerId: string | null = null;
  private role: 'caller' | 'callee' | null = null;

  private remoteIceCandidates: RTCIceCandidate[] = [];
  private hasRemoteDescription = false;

  private pendingCallerMatch = false;
  private pendingVideoOffer: VideoOfferInputMessage | null = null;

  private readonly turnCredentialCache: TurnCredentialCache;

  constructor(
    private readonly factory: PeerConnectionFactory,
    private readonly signaler: Signaler,
    private readonly events: PeerConnectionEvents,
    private readonly logger: Logger = console
  ) {
    this.turnCredentialCache = new TurnCredentialCache(signaler, () => {
      this.events.onIceServersExpired?.();
    });
  }

  // Test helper to inject pre-fetched ICE servers
  setIceServersForTest(servers: IceServer[]): void {
    this.turnCredentialCache.setIceServersForTest(servers);
  }

  getStrangerId(): string | null {
    return this.strangerId;
  }

  getRole(): 'caller' | 'callee' | null {
    return this.role;
  }

  async setLocalStream(stream: MediaStream): Promise<void> {
    this.webcamStream = stream;

    if (this.pendingCallerMatch) {
      this.pendingCallerMatch = false;
      await this.invite();
    }
    if (this.pendingVideoOffer) {
      const offer = this.pendingVideoOffer;
      this.pendingVideoOffer = null;
      await this.handleVideoOfferMsg(offer);
    }
  }

  async handleIncoming(msg: ReceivedMessage): Promise<void> {
    this.logger.log(`<-- Received : ${msg.action}`);

    switch (msg.action) {
      case Actions.INI_OFFER: {
        const initOffer = msg as InitOfferMessage;
        this.role = initOffer.role;
        if (initOffer.role === 'caller') {
          this.strangerId = initOffer.strangerId;
          this.events.onStrangerIdChange?.(this.strangerId);
          await this.invite();
        }
        break;
      }

      case Actions.VIDEO_OFFER:
        await this.handleVideoOfferMsg(msg as VideoOfferInputMessage);
        break;

      case Actions.VIDEO_ANSWER:
        await this.handleVideoAnswerMsg(msg as VideoAnswerInputMessage);
        break;

      case Actions.NEW_ICE_CANDIDATE:
        await this.handleNewICECandidateMsg(msg as NewIceCandidateMessage);
        break;

      case Actions.HANG_UP:
        this.handleHangUpMsg();
        break;

      case Actions.TURN_CREDENTIALS: {
        const creds = msg as TurnCredentialsMessage;
        this.turnCredentialCache.cacheCredentials(
          creds.iceServers,
          creds.expiresAt
        );
        break;
      }

      case Actions.CHAT_MESSAGE:
        // Chat messages are handled by ChatSession, not here
        break;

      default:
      // nothing to do
    }
  }

  async start(): Promise<void> {
    this.logger.log('---> SEND START (looking for stranger)');
    const startMessage: Message = {
      action: Actions.START
    };
    sendToServer(this.signaler, startMessage);
  }

  hangUp(reason?: 'replacing' | 'stopping'): void {
    const currentStrangerId = this.strangerId;

    if (!currentStrangerId) {
      this.logger.log('No stranger matched; skipping HANG_UP send');
      this.closeVideoCall(reason);
      return;
    }

    this.logger.log(`---> SEND HANG_UP to ${currentStrangerId}`);
    const hangUpMessage: HangUpMessage = {
      action: Actions.HANG_UP,
      strangerId: currentStrangerId
    };
    sendToServer(this.signaler, hangUpMessage);

    this.closeVideoCall(reason);
  }

  dispose(): void {
    this.closeVideoCall('stopping');
    this.turnCredentialCache.clearCredentialCache();
  }

  private async createPeerConnection(): Promise<void> {
    const iceServers = await this.turnCredentialCache.getIceServers();

    this.myPeerConnection = this.factory.create({
      iceServers: iceServers
    });

    this.myPeerConnection.onicecandidate =
      this.handleICECandidateEvent.bind(this);
    this.myPeerConnection.oniceconnectionstatechange =
      this.handleICEConnectionStateChangeEvent.bind(this);
    this.myPeerConnection.onicegatheringstatechange =
      this.handleICEGatheringStateChangeEvent.bind(this);
    this.myPeerConnection.onsignalingstatechange =
      this.handleSignalingStateChangeEvent.bind(this);
    this.myPeerConnection.onconnectionstatechange =
      this.handleConnectionStateChangeEvent.bind(this);
    this.myPeerConnection.onnegotiationneeded =
      this.handleNegotiationNeededEvent.bind(this);
    this.myPeerConnection.ontrack = this.handleTrackEvent.bind(this);
  }

  private async invite(): Promise<void> {
    this.logger.log('INVITE');

    if (!this.webcamStream) {
      this.logger.log('INVITE deferred: webcam stream not ready yet');
      this.pendingCallerMatch = true;
      return;
    }

    if (this.myPeerConnection) {
      this.events.onError?.(
        new Error("You can't start a call because you already have one open!")
      );
      return;
    }

    await this.createPeerConnection();

    try {
      this.webcamStream
        .getTracks()
        .forEach(track =>
          this.myPeerConnection?.addTrack(
            track,
            this.webcamStream as MediaStream
          )
        );
    } catch (err) {
      this.handleGetUserMediaError(err as Error);
    }
  }

  private async handleVideoOfferMsg(
    msg: VideoOfferInputMessage
  ): Promise<void> {
    this.strangerId = msg.senderId;
    this.events.onStrangerIdChange?.(this.strangerId);

    this.logger.log(`RECEIVE VIDEO OFFER from ${this.strangerId}`);

    if (!this.webcamStream) {
      this.logger.log('VIDEO OFFER deferred: webcam stream not ready yet');
      this.pendingVideoOffer = msg;
      return;
    }

    if (!this.myPeerConnection) {
      await this.createPeerConnection();
    }
    if (!this.myPeerConnection) return;

    const desc = new RTCSessionDescription(msg.sdp);

    await this.myPeerConnection.setRemoteDescription(desc);

    this.hasRemoteDescription = true;

    const size = this.remoteIceCandidates.length;

    if (size > 0) {
      for (const candidate of this.remoteIceCandidates) {
        await this.myPeerConnection.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      }

      this.remoteIceCandidates = [];
      this.logger.log(
        `${size} received remote ICE candidates added to local peer`
      );
    }

    this.webcamStream
      .getTracks()
      .forEach(track =>
        this.myPeerConnection?.addTrack(track, this.webcamStream as MediaStream)
      );

    await this.myPeerConnection.setLocalDescription(
      await this.myPeerConnection.createAnswer()
    );

    this.logger.log(`---> SEND VIDEO ANSWER to ${this.strangerId}`);
    const videoAnswerMessage: VideoAnswerOutputMessage = {
      action: Actions.VIDEO_ANSWER,
      strangerId: this.strangerId,
      sdp: this.myPeerConnection?.localDescription as RTCSessionDescription
    };
    sendToServer(this.signaler, videoAnswerMessage);
  }

  private async handleVideoAnswerMsg(
    msg: VideoAnswerInputMessage
  ): Promise<void> {
    if (!this.myPeerConnection) return;

    this.logger.log('RECEIVE VIDEO ANSWER');
    const desc = new RTCSessionDescription(msg.sdp);
    try {
      await this.myPeerConnection.setRemoteDescription(desc);
    } catch (err) {
      this.events.onError?.(err as Error);
      throw err;
    }
    this.hasRemoteDescription = true;
  }

  private handleTrackEvent(event: RTCTrackEvent): void {
    const stream = event.streams[0];
    if (stream) {
      this.events.onRemoteTrack?.(stream);
    }
  }

  private handleICECandidateEvent(event: RTCPeerConnectionIceEvent): void {
    if (event.candidate && this.strangerId) {
      this.logger.log(`---> SEND ICE CANDIDATE to ${this.strangerId}`);
      const newIceCandidateMessage: NewIceCandidateMessage = {
        action: Actions.NEW_ICE_CANDIDATE,
        strangerId: this.strangerId,
        candidate: event.candidate
      };
      sendToServer(this.signaler, newIceCandidateMessage);
    }
  }

  private async handleNewICECandidateMsg(
    msg: NewIceCandidateMessage
  ): Promise<void> {
    if (!this.myPeerConnection || !this.hasRemoteDescription) {
      this.remoteIceCandidates.push(msg.candidate);
      return;
    }

    const candidate = new RTCIceCandidate(msg.candidate);

    try {
      await this.myPeerConnection.addIceCandidate(candidate);
    } catch (err) {
      this.logger.error(err);
    }
  }

  private handleICEConnectionStateChangeEvent(): void {
    if (!this.myPeerConnection) return;

    this.logger.log(
      `[pc] iceConnectionState=${this.myPeerConnection.iceConnectionState} role=${this.role} stranger=${this.strangerId}`
    );

    switch (this.myPeerConnection.iceConnectionState) {
      case 'closed':
      case 'failed':
        this.closeVideoCall();
        break;
    }
  }

  private handleSignalingStateChangeEvent(): void {
    if (!this.myPeerConnection) return;

    this.logger.log(
      `[pc] signalingState=${this.myPeerConnection.signalingState} role=${this.role} stranger=${this.strangerId}`
    );

    switch (this.myPeerConnection.signalingState) {
      case 'closed':
        this.closeVideoCall();
        break;
      case 'have-remote-offer':
        break;
    }
  }

  private handleICEGatheringStateChangeEvent(): void {
    if (!this.myPeerConnection) return;
    this.logger.log(
      `[pc] iceGatheringState=${this.myPeerConnection.iceGatheringState} role=${this.role} stranger=${this.strangerId}`
    );
  }

  private handleConnectionStateChangeEvent(): void {
    if (!this.myPeerConnection) return;
    this.logger.log(
      `[pc] connectionState=${this.myPeerConnection.connectionState} role=${this.role} stranger=${this.strangerId}`
    );
  }

  private async handleNegotiationNeededEvent(): Promise<void> {
    if (!this.myPeerConnection || !this.strangerId || this.role === 'callee')
      return;

    try {
      const offer = await this.myPeerConnection.createOffer();

      if (this.myPeerConnection.signalingState !== 'stable') {
        return;
      }

      await this.myPeerConnection.setLocalDescription(offer);

      this.logger.log(`---> SEND VIDEO OFFER to ${this.strangerId}`);
      const videoOfferMessage: VideoOfferOutputMessage = {
        action: Actions.VIDEO_OFFER,
        sdp: this.myPeerConnection.localDescription as RTCSessionDescription,
        strangerId: this.strangerId
      };
      sendToServer(this.signaler, videoOfferMessage);
    } catch (err) {
      this.logger.log(
        '*** The following error occurred while handling the negotiationneeded event:'
      );
      this.logger.error(err);
    }
  }

  private handleGetUserMediaError(e: Error): void {
    this.logger.error(e);
    const mappedError = mapGetUserMediaError(e);

    switch (mappedError.type) {
      case 'NotFoundError':
        this.events.onError?.(
          new Error(
            'Unable to open your call because no camera and/or microphone were found.'
          )
        );
        break;
      case 'PermissionDeniedError':
        // User denied permission - don't show error toast, just close
        break;
      default:
        this.events.onError?.(
          new Error(`Error opening your camera and/or microphone: ${e.message}`)
        );
        break;
    }

    this.closeVideoCall();
  }

  private handleHangUpMsg(): void {
    this.closeVideoCall();
  }

  private closeVideoCall(reason?: 'replacing' | 'stopping'): void {
    this.logger.log('Closing the call');

    if (this.myPeerConnection) {
      this.logger.log('--> Closing the peer connection');

      this.myPeerConnection.ontrack = null;
      this.myPeerConnection.onicecandidate = null;
      this.myPeerConnection.oniceconnectionstatechange = null;
      this.myPeerConnection.onsignalingstatechange = null;
      this.myPeerConnection.onicegatheringstatechange = null;
      this.myPeerConnection.onconnectionstatechange = null;
      this.myPeerConnection.onnegotiationneeded = null;

      this.myPeerConnection.getTransceivers().forEach(transceiver => {
        transceiver.stop();
      });

      this.myPeerConnection.close();
      this.myPeerConnection = null;
      this.hasRemoteDescription = false;
      this.remoteIceCandidates = [];

      this.events.onClose?.(reason);
    }

    this.pendingCallerMatch = false;
    this.pendingVideoOffer = null;

    this.strangerId = null;
    this.events.onStrangerIdChange?.(null);
  }
}
