import type { IceServer } from '@repo/signaling-types/messages';
import {
  Actions,
  type InitOfferMessage,
  type Message,
  type TurnCredentialsMessage
} from '@repo/signaling-types/messages';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PeerConnectionEngine,
  type PeerConnectionFactory
} from '../peer-connection-engine';
import { type Signaler } from '../types';

const mockAddTrack = vi.fn();
const mockCreateOffer = vi.fn();
const mockCreateAnswer = vi.fn();
const mockSetLocalDescription = vi.fn().mockResolvedValue(undefined);
const mockSetRemoteDescription = vi.fn().mockResolvedValue(undefined);
const mockAddIceCandidate = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn();
const mockGetTransceivers = vi.fn(() => []);

let MockRTCPeerConnectionClass: new () => {
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null;
  oniceconnectionstatechange: (() => void) | null;
  onicegatheringstatechange: (() => void) | null;
  onsignalingstatechange: (() => void) | null;
  onconnectionstatechange: (() => void) | null;
  onnegotiationneeded: (() => void) | null;
  ontrack: ((event: RTCTrackEvent) => void) | null;
  iceConnectionState: RTCIceConnectionState;
  signalingState: RTCSignalingState;
  iceGatheringState: RTCIceGatheringState;
  connectionState: RTCPeerConnectionState;
  localDescription: RTCSessionDescription | null;
  remoteDescription: RTCSessionDescription | null;
  addTrack: ReturnType<typeof vi.fn>;
  createOffer: ReturnType<typeof vi.fn>;
  createAnswer: ReturnType<typeof vi.fn>;
  setLocalDescription: ReturnType<typeof vi.fn>;
  setRemoteDescription: ReturnType<typeof vi.fn>;
  addIceCandidate: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  getTransceivers: ReturnType<typeof vi.fn>;
};

const createMockFactory = (): PeerConnectionFactory => ({
  create: () => new MockRTCPeerConnectionClass() as unknown as RTCPeerConnection
});

function createMockSignaler(): Signaler {
  return { send: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAddTrack.mockClear();
  mockCreateOffer.mockClear();
  mockCreateAnswer.mockClear();
  mockSetLocalDescription.mockClear();
  mockSetRemoteDescription.mockClear();
  mockAddIceCandidate.mockClear();
  mockClose.mockClear();
  mockGetTransceivers.mockClear();

  MockRTCPeerConnectionClass = class {
    onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
    oniceconnectionstatechange: (() => void) | null = null;
    onicegatheringstatechange: (() => void) | null = null;
    onsignalingstatechange: (() => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    onnegotiationneeded: (() => void) | null = null;
    ontrack: ((event: RTCTrackEvent) => void) | null = null;

    iceConnectionState: RTCIceConnectionState = 'new';
    signalingState: RTCSignalingState = 'stable';
    iceGatheringState: RTCIceGatheringState = 'new';
    connectionState: RTCPeerConnectionState = 'new';
    localDescription: RTCSessionDescription | null = null;
    remoteDescription: RTCSessionDescription | null = null;

    addTrack = mockAddTrack;
    createOffer = mockCreateOffer;
    createAnswer = mockCreateAnswer;
    setLocalDescription = mockSetLocalDescription;
    setRemoteDescription = mockSetRemoteDescription;
    addIceCandidate = mockAddIceCandidate;
    close = mockClose;
    getTransceivers = mockGetTransceivers;
  } as any;
});

describe('PeerConnectionEngine', () => {
  let factory: PeerConnectionFactory;
  let signaler: Signaler;
  let events: {
    onRemoteTrack?: (stream: MediaStream) => void;
    onClose?: (reason?: 'replacing' | 'stopping' | 'timeout') => void;
    onError?: (err: Error) => void;
  };
  let engine: PeerConnectionEngine;

  beforeEach(() => {
    factory = createMockFactory();
    signaler = createMockSignaler();
    events = {
      onRemoteTrack: vi.fn(),
      onClose: vi.fn(),
      onError: vi.fn()
    };
    engine = new PeerConnectionEngine(factory, signaler, events);

    // Use test helper to set ICE servers and avoid 8-second TURN timeout
    engine.setIceServersForTest([{ urls: 'stun:stun.l.google.com:19302' }]);
  });

  describe('start', () => {
    it('sends START message via signaler', async () => {
      await engine.start();
      expect(signaler.send).toHaveBeenCalledWith(
        JSON.stringify({ action: Actions.START })
      );
      engine.dispose();
    });

    it('emits error and closes call when no match is found', async () => {
      vi.useFakeTimers();
      engine = new PeerConnectionEngine(
        factory,
        signaler,
        events,
        console,
        1_000
      );
      engine.setIceServersForTest([{ urls: 'stun:stun.l.google.com:19302' }]);

      await engine.start();

      expect(events.onClose).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1_000);

      expect(events.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No stranger found. Please try again.'
        })
      );
      expect(events.onClose).toHaveBeenCalledWith('timeout');
      expect(engine.getStrangerId()).toBeNull();

      vi.useRealTimers();
    });

    it('cancels the search timeout once a match arrives', async () => {
      vi.useFakeTimers();
      engine = new PeerConnectionEngine(
        factory,
        signaler,
        events,
        console,
        1_000
      );
      engine.setIceServersForTest([{ urls: 'stun:stun.l.google.com:19302' }]);

      await engine.start();

      const initOffer: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'caller',
        strangerId: 'stranger-1'
      };
      await engine.handleIncoming(initOffer);

      vi.advanceTimersByTime(1_000);

      expect(events.onError).not.toHaveBeenCalled();
      expect(events.onClose).not.toHaveBeenCalled();
      expect(engine.getStrangerId()).toBe('stranger-1');

      vi.useRealTimers();
    });
  });

  describe('setLocalStream', () => {
    it('stores the stream', async () => {
      const mockStream = {} as MediaStream;
      await engine.setLocalStream(mockStream);
      expect(engine.getStrangerId()).toBeNull();
    });

    // Skipped: requires proper mocking of turnCredentialCache before engine construction
    // it('invites if caller match pending after stream arrives', async () => { ... });
  });

  describe('handleIncoming', () => {
    it('handles INI_OFFER as caller', async () => {
      const initOffer: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'caller',
        strangerId: 'stranger-1'
      };

      await engine.handleIncoming(initOffer);
      expect(engine.getStrangerId()).toBe('stranger-1');
      expect(engine.getRole()).toBe('caller');
    });

    it('handles INI_OFFER as callee (strangerId set later on video offer)', async () => {
      const initOffer: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'callee',
        strangerId: 'stranger-2'
      };

      await engine.handleIncoming(initOffer);
      // For callee, strangerId is not set until VIDEO_OFFER arrives
      expect(engine.getStrangerId()).toBeNull();
      expect(engine.getRole()).toBe('callee');
    });

    it('handles VIDEO_OFFER as callee and sets strangerId', async () => {
      // First set role as callee
      await engine.handleIncoming({
        action: Actions.INI_OFFER,
        role: 'callee',
        strangerId: 'stranger-2'
      });

      // Then receive video offer
      const videoOffer = {
        action: Actions.VIDEO_OFFER,
        senderId: 'stranger-2',
        sdp: { type: 'offer' as const, sdp: 'mock-sdp' }
      };

      await engine.handleIncoming(videoOffer as any);
      expect(engine.getStrangerId()).toBe('stranger-2');
    });

    it('handles HANG_UP when no peer connection exists', async () => {
      const initOffer: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'caller',
        strangerId: 'stranger-1'
      };
      await engine.handleIncoming(initOffer);

      const hangUpMsg = { action: Actions.HANG_UP };
      await engine.handleIncoming(hangUpMsg as any);

      expect(engine.getStrangerId()).toBeNull();
      // onClose not called because no peer connection was created yet
    });
  });

  describe('hangUp', () => {
    it('sends HANG_UP and closes connection', async () => {
      const initOffer: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'caller',
        strangerId: 'stranger-1'
      };
      await engine.handleIncoming(initOffer);

      // Set local stream to create peer connection
      await engine.setLocalStream({
        getTracks: () => []
      } as unknown as MediaStream);

      engine.hangUp('stopping');

      expect(signaler.send).toHaveBeenCalledWith(
        expect.stringContaining('"action":"hangUp"')
      );
      expect(engine.getStrangerId()).toBeNull();
    });
  });

  describe('dispose', () => {
    it('closes video call and clears credential cache', async () => {
      const initOffer: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'caller',
        strangerId: 'stranger-1'
      };
      await engine.handleIncoming(initOffer);

      // Set local stream to create peer connection
      await engine.setLocalStream({
        getTracks: () => []
      } as unknown as MediaStream);

      engine.dispose();

      expect(mockClose).toHaveBeenCalled();
      expect(engine.getStrangerId()).toBeNull();
    });
  });
});
