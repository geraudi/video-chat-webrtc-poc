import {
  Actions,
  type ChatMessageOutputMessage,
  type InitOfferMessage
} from '@repo/signaling-types/messages';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSession } from '../chat-session';

const createMockEngine = () => ({
  events: {},
  start: vi.fn().mockResolvedValue(undefined),
  hangUp: vi.fn(),
  sendChatMessage: vi.fn(),
  handleIncoming: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn(),
  getStrangerId: vi.fn().mockReturnValue(null),
  getRole: vi.fn().mockReturnValue(null)
});

describe('ChatSession', () => {
  let signaler: { send: ReturnType<typeof vi.fn> };
  let mockEngine: ReturnType<typeof createMockEngine>;
  let events: {
    onChatMessage?: (content: string, senderId: string) => void;
  };
  let session: ChatSession;

  beforeEach(() => {
    vi.clearAllMocks();
    signaler = { send: vi.fn() };
    mockEngine = createMockEngine();
    events = { onChatMessage: vi.fn() };
    session = new ChatSession(signaler as any, mockEngine as any, events);
  });

  describe('constructor', () => {
    it('generates a userId', () => {
      expect(session.userId).toMatch(/^user_\d+_[a-z0-9]+$/);
    });
  });

  describe('handleIncomingMessage', () => {
    it('routes CHAT_MESSAGE to onChatMessage callback', async () => {
      const chatMsg: ChatMessageOutputMessage = {
        action: Actions.CHAT_MESSAGE,
        content: 'Hello',
        senderId: 'stranger-1'
      };

      await session.handleIncomingMessage(chatMsg);

      expect(events.onChatMessage).toHaveBeenCalledWith('Hello', 'stranger-1');
    });

    it('routes INI_OFFER to engine', async () => {
      const initOffer: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'caller',
        strangerId: 'stranger-1'
      };

      await session.handleIncomingMessage(initOffer);

      expect(mockEngine.handleIncoming).toHaveBeenCalledWith(initOffer);
    });

    it('routes VIDEO_OFFER to engine', async () => {
      const videoOffer = {
        action: Actions.VIDEO_OFFER,
        senderId: 'stranger-1',
        sdp: {}
      };

      await session.handleIncomingMessage(videoOffer as any);

      expect(mockEngine.handleIncoming).toHaveBeenCalledWith(videoOffer);
    });

    it('routes VIDEO_ANSWER to engine', async () => {
      const videoAnswer = {
        action: Actions.VIDEO_ANSWER,
        senderId: 'stranger-1',
        sdp: {}
      };

      await session.handleIncomingMessage(videoAnswer as any);

      expect(mockEngine.handleIncoming).toHaveBeenCalledWith(videoAnswer);
    });

    it('routes NEW_ICE_CANDIDATE to engine', async () => {
      const iceCandidate = {
        action: Actions.NEW_ICE_CANDIDATE,
        senderId: 'stranger-1',
        candidate: {}
      };

      await session.handleIncomingMessage(iceCandidate as any);

      expect(mockEngine.handleIncoming).toHaveBeenCalledWith(iceCandidate);
    });

    it('routes HANG_UP to engine', async () => {
      const hangUp = { action: Actions.HANG_UP };

      await session.handleIncomingMessage(hangUp as any);

      expect(mockEngine.handleIncoming).toHaveBeenCalledWith(hangUp);
    });

    it('routes TURN_CREDENTIALS to engine', async () => {
      const turnCreds = {
        action: Actions.TURN_CREDENTIALS,
        iceServers: [],
        expiresAt: 0
      };

      await session.handleIncomingMessage(turnCreds as any);

      expect(mockEngine.handleIncoming).toHaveBeenCalledWith(turnCreds);
    });
  });

  describe('sendChatMessage', () => {
    it('sends CHAT_MESSAGE via signaler when strangerId is available', () => {
      mockEngine.getStrangerId.mockReturnValue('stranger-1');

      session.sendChatMessage('Test message');

      expect(signaler.send).toHaveBeenCalledWith(
        JSON.stringify({
          action: Actions.CHAT_MESSAGE,
          content: 'Test message',
          strangerId: 'stranger-1'
        })
      );
    });

    it('does not send if strangerId is null', () => {
      mockEngine.getStrangerId.mockReturnValue(null);

      session.sendChatMessage('Test message');

      expect(signaler.send).not.toHaveBeenCalled();
    });

    it('does not send if content is empty', () => {
      mockEngine.getStrangerId.mockReturnValue('stranger-1');

      session.sendChatMessage('   ');

      expect(signaler.send).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('calls engine.start', async () => {
      await session.start();
      expect(mockEngine.start).toHaveBeenCalled();
    });
  });

  describe('hangUp', () => {
    it('calls engine.hangUp with reason', () => {
      session.hangUp('stopping');
      expect(mockEngine.hangUp).toHaveBeenCalledWith('stopping');
    });

    it('calls engine.hangUp without reason', () => {
      session.hangUp();
      expect(mockEngine.hangUp).toHaveBeenCalledWith(undefined);
    });
  });

  describe('dispose', () => {
    it('calls engine.dispose', () => {
      session.dispose();
      expect(mockEngine.dispose).toHaveBeenCalled();
    });
  });

  describe('strangerId getter', () => {
    it('returns engine strangerId', () => {
      mockEngine.getStrangerId.mockReturnValue('stranger-1');
      expect(session.strangerId).toBe('stranger-1');
    });

    it('returns null when engine has no strangerId', () => {
      mockEngine.getStrangerId.mockReturnValue(null);
      expect(session.strangerId).toBeNull();
    });
  });

  describe('role getter', () => {
    it('returns engine role', () => {
      mockEngine.getRole.mockReturnValue('caller');
      expect(session.role).toBe('caller');
    });
  });
});
