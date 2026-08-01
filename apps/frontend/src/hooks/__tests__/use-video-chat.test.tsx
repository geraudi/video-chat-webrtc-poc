import { PeerConnectionEngine } from '@repo/webrtc';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/toast';

import { useVideoChat } from '../use-video-chat';

vi.mock('react-use-websocket', () => ({
  default: vi.fn(() => ({
    sendMessage: vi.fn(),
    lastMessage: null,
    readyState: 1
  })),
  ReadyState: { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }
}));

vi.mock('@repo/webrtc', () => ({
  PeerConnectionEngine: vi.fn().mockImplementation(function (
    this: {
      events: Record<string, unknown>;
      setLocalStream: ReturnType<typeof vi.fn>;
      strangerId: string | null;
    },
    _factory: unknown,
    _signaler: unknown,
    events: Record<string, unknown>
  ) {
    this.events = events;
    this.setLocalStream = vi.fn();
    this.strangerId = null;
  })
}));

vi.mock('@repo/chat', () => ({
  ChatSession: vi.fn().mockImplementation(function (
    this: {
      userId: string;
      engine: unknown;
      start: ReturnType<typeof vi.fn>;
      hangUp: ReturnType<typeof vi.fn>;
      sendChatMessage: ReturnType<typeof vi.fn>;
      handleIncomingMessage: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    },
    _signaler: unknown,
    engine: unknown
  ) {
    this.userId = 'user-1';
    this.engine = engine;
    this.start = vi.fn();
    this.hangUp = vi.fn();
    this.sendChatMessage = vi.fn();
    this.handleIncomingMessage = vi.fn();
    this.dispose = vi.fn();
  }),
  generateUserId: () => 'user-1'
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { add: vi.fn() }
}));

interface MockEngine {
  events: { onError?: (err: Error) => void };
}

describe('useVideoChat error surfacing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces engine errors as error toasts instead of alert()', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const { unmount } = renderHook(() => useVideoChat());

    const engine = vi.mocked(PeerConnectionEngine).mock
      .instances[0] as unknown as MockEngine;
    expect(engine).toBeDefined();

    act(() => {
      engine.events.onError?.(new Error('camera missing'));
    });

    expect(toast.add).toHaveBeenCalledWith({
      title: 'Call error',
      description: 'camera missing',
      type: 'error',
      timeout: 5000
    });
    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
    unmount();
  });
});
