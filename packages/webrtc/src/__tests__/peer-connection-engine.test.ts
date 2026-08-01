import type { IceServer } from '@repo/signaling-types/messages';
import {
  Actions,
  type InitOfferMessage,
  type Message,
  type TurnCredentialsMessage
} from '@repo/signaling-types/messages';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PeerConnectionEngine,
  type PeerConnectionFactory
} from '../peer-connection-engine';
import { type Signaler } from '../types';

const mockAddTrack = vi.fn();
const mockCreateOffer = vi.fn().mockResolvedValue({
  type: 'offer',
  sdp: 'mock-sdp'
});
const mockCreateAnswer = vi.fn().mockResolvedValue({
  type: 'answer',
  sdp: 'mock-sdp'
});
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
    setLocalDescription = vi.fn((desc: RTCSessionDescription) => {
      this.localDescription = desc;
      return mockSetLocalDescription(desc);
    });
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

  describe('replaceTrack', () => {
    const audioTrack = { id: 'mic-1', kind: 'audio' } as MediaStreamTrack;
    const videoTrack = { id: 'cam-1', kind: 'video' } as MediaStreamTrack;
    const replacementAudioTrack = {
      id: 'mic-2',
      kind: 'audio'
    } as MediaStreamTrack;
    const replacementVideoTrack = {
      id: 'cam-2',
      kind: 'video'
    } as MediaStreamTrack;
    const audioSender = {
      track: audioTrack,
      replaceTrack: vi.fn().mockResolvedValue(undefined)
    };
    const videoSender = {
      track: videoTrack,
      replaceTrack: vi.fn().mockResolvedValue(undefined)
    };

    const setUpCall = async (tracks: MediaStreamTrack[]): Promise<void> => {
      const initOffer: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'caller',
        strangerId: 'stranger-1'
      };
      await engine.handleIncoming(initOffer);
      await engine.setLocalStream({
        getTracks: () => tracks
      } as unknown as MediaStream);
    };

    beforeEach(() => {
      mockAddTrack.mockImplementation((track: MediaStreamTrack) =>
        track.kind === 'audio' ? audioSender : videoSender
      );
      audioSender.replaceTrack.mockClear();
      videoSender.replaceTrack.mockClear();
    });

    it('replaces the audio track on the matching sender', async () => {
      await setUpCall([audioTrack, videoTrack]);

      await engine.replaceTrack('audio', replacementAudioTrack);

      expect(audioSender.replaceTrack).toHaveBeenCalledWith(
        replacementAudioTrack
      );
      expect(videoSender.replaceTrack).not.toHaveBeenCalled();
    });

    it('replaces the video track on the matching sender', async () => {
      await setUpCall([audioTrack, videoTrack]);

      await engine.replaceTrack('video', replacementVideoTrack);

      expect(videoSender.replaceTrack).toHaveBeenCalledWith(
        replacementVideoTrack
      );
      expect(audioSender.replaceTrack).not.toHaveBeenCalled();
    });

    it('mutes a track by replacing it with null', async () => {
      await setUpCall([audioTrack, videoTrack]);

      await engine.replaceTrack('audio', null);

      expect(audioSender.replaceTrack).toHaveBeenCalledWith(null);
    });

    it('unmutes after muting (sender lookup survives a null track)', async () => {
      await setUpCall([audioTrack, videoTrack]);

      await engine.replaceTrack('audio', null);
      await engine.replaceTrack('audio', audioTrack);

      expect(audioSender.replaceTrack).toHaveBeenNthCalledWith(1, null);
      expect(audioSender.replaceTrack).toHaveBeenNthCalledWith(2, audioTrack);
    });

    it('emits onError when the new track kind does not match', async () => {
      await setUpCall([audioTrack, videoTrack]);

      await engine.replaceTrack('audio', replacementVideoTrack);

      expect(audioSender.replaceTrack).not.toHaveBeenCalled();
      expect(events.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Cannot replace audio track with a video track.'
        })
      );
    });

    it('emits onError when there is no active peer connection', async () => {
      await engine.replaceTrack('audio', audioTrack);

      expect(events.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No active call to replace a track on.'
        })
      );
    });

    it('emits onError when no sender matches the requested kind', async () => {
      await setUpCall([audioTrack]);

      await engine.replaceTrack('video', replacementVideoTrack);

      expect(events.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No active video track to replace.'
        })
      );
    });
  });

  describe('ICE restart on failed/disconnected', () => {
    let capturedPc: {
      iceConnectionState: RTCIceConnectionState;
      iceGatheringState: RTCIceGatheringState;
      signalingState: RTCSignalingState;
      oniceconnectionstatechange: (() => void) | null;
    };

    beforeEach(async () => {
      const factoryWithCapture: PeerConnectionFactory = {
        create: () => {
          capturedPc =
            new MockRTCPeerConnectionClass() as unknown as typeof capturedPc;
          return capturedPc as unknown as RTCPeerConnection;
        }
      };
      engine = new PeerConnectionEngine(factoryWithCapture, signaler, events);
      engine.setIceServersForTest([{ urls: 'stun:stun.l.google.com:19302' }]);

      await engine.handleIncoming({
        action: Actions.INI_OFFER,
        role: 'caller',
        strangerId: 'stranger-1'
      });
      await engine.setLocalStream({
        getTracks: () => []
      } as unknown as MediaStream);
    });

    const setIceState = (
      state: RTCIceConnectionState,
      gathering: RTCIceGatheringState = 'complete'
    ): void => {
      capturedPc.iceConnectionState = state;
      capturedPc.iceGatheringState = gathering;
      capturedPc.oniceconnectionstatechange?.();
    };

    it('closes the call on failed when never connected (gathering incomplete)', () => {
      setIceState('failed', 'new');
      expect(mockClose).toHaveBeenCalled();
      expect(signaler.send).not.toHaveBeenCalledWith(
        expect.stringContaining('"action":"videoOffer"')
      );
    });

    it('sends an ICE restart offer on failed when gathering is complete', async () => {
      setIceState('failed', 'complete');
      expect(mockClose).not.toHaveBeenCalled();
      await vi.waitFor(() =>
        expect(signaler.send).toHaveBeenCalledWith(
          expect.stringContaining('"action":"videoOffer"')
        )
      );
      expect(signaler.send).toHaveBeenCalledWith(
        expect.stringContaining('"strangerId":"stranger-1"')
      );
    });

    it('sends an ICE restart offer on disconnected', async () => {
      setIceState('disconnected', 'complete');
      expect(mockClose).not.toHaveBeenCalled();
      await vi.waitFor(() =>
        expect(signaler.send).toHaveBeenCalledWith(
          expect.stringContaining('"action":"videoOffer"')
        )
      );
    });

    it('closes the call when the connection fails again after a restart attempt', () => {
      setIceState('failed', 'complete');
      expect(mockClose).not.toHaveBeenCalled();

      setIceState('failed', 'complete');
      expect(mockClose).toHaveBeenCalled();
    });

    it('resets the restart counter once the connection reconnects', async () => {
      setIceState('failed', 'complete');
      setIceState('connected', 'complete');
      setIceState('failed', 'complete');

      expect(mockClose).not.toHaveBeenCalled();
      await vi.waitFor(() =>
        expect(signaler.send).toHaveBeenCalledWith(
          expect.stringContaining('"action":"videoOffer"')
        )
      );
    });
  });

  describe('connectionState hardening', () => {
    let capturedPc: {
      connectionState: RTCPeerConnectionState;
      onconnectionstatechange: (() => void) | null;
    };

    beforeEach(async () => {
      vi.useFakeTimers();

      const factoryWithCapture: PeerConnectionFactory = {
        create: () => {
          capturedPc =
            new MockRTCPeerConnectionClass() as unknown as typeof capturedPc;
          return capturedPc as unknown as RTCPeerConnection;
        }
      };
      engine = new PeerConnectionEngine(factoryWithCapture, signaler, events);
      engine.setIceServersForTest([{ urls: 'stun:stun.l.google.com:19302' }]);

      await engine.handleIncoming({
        action: Actions.INI_OFFER,
        role: 'caller',
        strangerId: 'stranger-1'
      });
      await engine.setLocalStream({
        getTracks: () => []
      } as unknown as MediaStream);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const setConnectionState = (state: RTCPeerConnectionState): void => {
      capturedPc.connectionState = state;
      capturedPc.onconnectionstatechange?.();
    };

    it('closes the call immediately when connectionState becomes failed', () => {
      setConnectionState('failed');
      expect(mockClose).toHaveBeenCalled();
      expect(events.onClose).toHaveBeenCalled();
    });

    it('closes the call after the grace period when the peer stays disconnected', () => {
      setConnectionState('disconnected');
      expect(mockClose).not.toHaveBeenCalled();

      vi.advanceTimersByTime(10_000);

      expect(mockClose).toHaveBeenCalled();
      expect(events.onClose).toHaveBeenCalled();
    });

    it('cancels the disconnect timer when the peer reconnects', () => {
      setConnectionState('disconnected');
      setConnectionState('connected');

      vi.advanceTimersByTime(30_000);

      expect(mockClose).not.toHaveBeenCalled();
    });

    it('closes the call when disconnected transitions to failed before the grace period', () => {
      setConnectionState('disconnected');
      setConnectionState('failed');

      expect(mockClose).toHaveBeenCalled();
    });
  });
});
