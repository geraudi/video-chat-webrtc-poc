import { expect } from '@playwright/test';

/**
 * Read-only view of the real local signaling server.
 *
 * `packages/signaling-ws/src/local-server/index.ts` exposes GET /health next to
 * the WebSocket endpoint. Reading it lets the test assert on genuine server
 * state instead of guessing from the UI.
 */

const SIGNALING_HOST = 'localhost:3001';
const HEALTH_URL = `http://${SIGNALING_HOST}/health`;

/**
 * WebSocket endpoint the app connects to in local mode (see src/config.ts).
 * Used to tell the signaling socket apart from Vite's HMR socket.
 */
export const SIGNALING_WS_URL = `ws://${SIGNALING_HOST}`;

export interface SignalingServerHealth {
  /** WebSocket connections the server currently holds. */
  peers: number;
  /** Connections waiting in the matching pool (sent `start`, not matched yet). */
  available: number;
}

export async function readSignalingServerHealth(): Promise<SignalingServerHealth> {
  const response = await fetch(HEALTH_URL);
  if (!response.ok) {
    throw new Error(`Signaling server /health returned ${response.status}`);
  }
  return (await response.json()) as SignalingServerHealth;
}

/**
 * Wait until nobody is waiting in the matching pool, and return the server
 * state at that moment as a baseline.
 *
 * The signaling server is shared (`reuseExistingServer` in playwright.config),
 * so a leftover peer — another browser tab left on "Looking for peer...", or a
 * context from a previous run still closing — would be matched with the first
 * peer of this test and steal the call. Failing here, fast and explicitly,
 * beats a mystified timeout later on.
 */
export async function waitForEmptyMatchingPool(): Promise<SignalingServerHealth> {
  await expect
    .poll(async () => (await readSignalingServerHealth()).available, {
      message:
        'A peer is waiting in the signaling server matching pool; close any browser tab left on "Looking for peer..." before running the suite',
      timeout: 10_000
    })
    .toBe(0);

  return readSignalingServerHealth();
}
