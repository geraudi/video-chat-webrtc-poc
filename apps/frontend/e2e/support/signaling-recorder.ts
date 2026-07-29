import type { Page } from '@playwright/test';

/**
 * Observes the signaling WebSocket a page opens, without touching it.
 *
 * Playwright reports frames as the browser actually sends and receives them, so
 * every recorded frame really travelled to the local signaling server on :3001
 * and back. No routing, stubbing or replaying is involved.
 */

export type FrameDirection = 'sent' | 'received';

export interface SignalingFrame {
  direction: FrameDirection;
  /** The `action` field of the signaling message (see @repo/signaling-types). */
  action: string;
}

export interface SignalingRecorder {
  /**
   * Every socket the page opened, signaling or not, in order. Lets a test state
   * where the app connected — including when it connected nowhere useful.
   */
  observedUrls(): string[];
  /** Every JSON frame seen so far, in order. */
  frames(): SignalingFrame[];
  /** Actions observed in one direction, in order (duplicates kept). */
  actions(direction: FrameDirection): string[];
}

/**
 * Start recording the socket whose URL starts with `signalingUrl` — the Vite dev
 * server opens its own HMR socket on the page, which must be ignored.
 *
 * Call this before `page.goto()`: the app opens its socket during the first
 * render, and frames sent before the listener is attached are lost.
 */
export function recordSignaling(
  page: Page,
  signalingUrl: string
): SignalingRecorder {
  const frames: SignalingFrame[] = [];
  const observedUrls: string[] = [];

  const record = (direction: FrameDirection, payload: string): void => {
    let action: unknown;
    try {
      action = (JSON.parse(payload) as { action?: unknown }).action;
    } catch {
      return; // Non-JSON frame (ping/pong or similar): not a signaling message.
    }
    if (typeof action === 'string') {
      frames.push({ direction, action });
    }
  };

  page.on('websocket', socket => {
    observedUrls.push(socket.url());
    if (!socket.url().startsWith(signalingUrl)) return;

    socket.on('framesent', frame => record('sent', frame.payload.toString()));
    socket.on('framereceived', frame =>
      record('received', frame.payload.toString())
    );
  });

  return {
    observedUrls: () => [...observedUrls],
    frames: () => [...frames],
    actions: direction =>
      frames
        .filter(frame => frame.direction === direction)
        .map(frame => frame.action)
  };
}
