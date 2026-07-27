import { type Browser, type BrowserContext, type Page, expect } from '@playwright/test';

/**
 * E2E helpers for the WebRTC video chat.
 *
 * Strategy:
 * - Use the REAL local WebSocket signaling server (started by Playwright's
 *   `webServer` config) — no client-side WS mock for the happy path.
 * - Use the REAL browser WebRTC APIs (RTCPeerConnection, getUserMedia). No
 *   media/transport mocking. Determinism comes from Chromium's fake-device
 *   mode (`--use-fake-device-for-media-stream`) configured in playwright.config.
 *
 * All waits are anchored on user-visible UI changes (button labels, status
 * text, video srcObject), never on arbitrary timeouts.
 */

/** Locators derived from the actual DOM (see src/components/video-chat.tsx). */
export const selectors = {
  /** The single primary button whose label/state is derived from `stage`. */
  actionButton: '[data-testid="action-button"]',
  /** Secondary "Stop" button, visible only in searching/connected stages. */
  stopButton: 'button:has-text("Stop")',
  localVideo: '[data-testid="local-video"]',
  strangerVideo: '[data-testid="stranger-video"]',
} as const;

/**
 * Intercept the app's TURN-credential fetch (metered.live) and return a minimal
 * STUN-only config.
 *
 * This does NOT mock WebRTC — RTCPeerConnection, ICE, SDP, and getUserMedia
 * all run for real. It only isolates a third-party credential service so the
 * tests are deterministic and work offline. On localhost (both pages in the
 * same browser), host ICE candidates alone are sufficient to establish a real
 * P2P connection, so no TURN relay is required.
 *
 * Must be called BEFORE page.goto() so the route is registered first.
 */
export async function isolateTurnCredentials(page: Page): Promise<void> {
  await page.route('**/metered.live/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ urls: 'stun:stun.l.google.com:19302' }]),
    }),
  );
}

/**
 * Wait until the app has established its WebSocket connection and reached the
 * idle ("Ready") stage — i.e. the Start button is present and enabled.
 */
export async function waitForReady(page: Page, timeout = 15000): Promise<void> {
  const startButton = page.locator(selectors.actionButton);
  // The button must be visible AND enabled (enabled only when WS is open).
  await expect(startButton).toBeVisible({ timeout });
  await expect(startButton).toBeEnabled({ timeout });
  await expect(startButton).toHaveText('Start', { timeout });
}

/**
 * Wait until a page transitions into the "searching" stage: the primary
 * button reads "Looking..." and is disabled, and a "Stop" button appears.
 */
export async function waitForSearching(page: Page, timeout = 10000): Promise<void> {
  const actionButton = page.locator(selectors.actionButton);
  await expect(actionButton).toHaveText('Looking...', { timeout });
  await expect(actionButton).toBeDisabled({ timeout });
  await expect(page.locator(selectors.stopButton)).toBeVisible({ timeout });
}

/**
 * Wait until a page transitions into the "connected" stage: the primary
 * button reads "Next" and is enabled, and the stranger video has a stream
 * attached (srcObject set by the ontrack handler).
 */
export async function waitForConnected(page: Page, timeout = 30000): Promise<void> {
  const actionButton = page.locator(selectors.actionButton);
  await expect(actionButton).toHaveText('Next', { timeout });
  await expect(actionButton).toBeEnabled({ timeout });
  // The remote video element receives a srcObject (a real MediaStream) once
  // ontrack fires after the real P2P connection is established.
  await expect
    .poll(
      async () =>
        page.locator(selectors.strangerVideo).evaluate(
          (el) => (el as HTMLVideoElement).srcObject != null,
        ),
      { timeout },
    )
    .toBe(true);
}

/**
 * Shape of the local signaling server's GET /health response.
 */
export interface ServerHealth {
  /** Total connected WebSocket peers. */
  peers: number;
  /** Peers currently waiting in the matching pool (sent START, no match yet). */
  available: number;
}

/**
 * Read the local signaling server's /health endpoint.
 *
 * Returns `{ peers: -1, available: -1 }` on fetch error so callers can poll
 * without try/catch; a real server always reports non-negative counts.
 */
export async function getServerHealth(): Promise<ServerHealth> {
  try {
    const res = await fetch('http://localhost:3001/health');
    return (await res.json()) as ServerHealth;
  } catch {
    return { peers: -1, available: -1 };
  }
}

/**
 * Poll the local signaling server's /health endpoint and resolve as soon as
 * it reports at least `minAvailable` available (waiting) connections.
 */
async function waitForServerAvailable(
  minAvailable: number,
  timeout = 5000,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const data = await getServerHealth();
        console.log('[DEBUG waitForServerAvailable]', JSON.stringify(data));
        return data.available;
      },
      { timeout, intervals: [200, 500, 1000] },
    )
    .toBeGreaterThanOrEqual(minAvailable);
}

/**
 * Click Start on both pages to trigger peer matching via the real server.
 *
 * The clicks are STAGGERED and synchronized on SERVER state (not just client
 * UI): page1 clicks first, then we wait until the server reports page1 as an
 * available peer (via /health), and ONLY THEN page2 clicks.
 *
 * This closes the race where the client UI flips to "Looking..." optimistically
 * (before the START message reaches the server), causing two near-simultaneous
 * START messages to both see no available peer and both wait forever.
 */
export async function clickStartOnBoth(page1: Page, page2: Page): Promise<void> {
  await page1.locator(selectors.actionButton).click();
  await waitForSearching(page1);
  // Wait until the server has ACTUALLY registered page1 as available before
  // letting page2 click — the UI wait alone is not sufficient.
  await waitForServerAvailable(1);
  await page2.locator(selectors.actionButton).click();
}

/**
 * Verify the local webcam video has a real MediaStream attached.
 */
export async function expectLocalVideoReady(page: Page, timeout = 10000): Promise<void> {
  await expect
    .poll(
      async () =>
        page.locator(selectors.localVideo).evaluate(
          (el) => (el as HTMLVideoElement).srcObject != null,
        ),
      { timeout },
    )
    .toBe(true);
}

/**
 * Create a pair of pages (same browser context) for a two-peer test.
 *
 * Permissions are granted at context level (camera/microphone), and Chromium's
 * fake-device flags (set in playwright.config) provide deterministic media
 * without any physical hardware. No WebRTC mocking is performed.
 */
export async function createPeerPages(
  browser: Browser,
): Promise<{ context: BrowserContext; page1: Page; page2: Page }> {
  const context = await browser.newContext({
    permissions: ['camera', 'microphone'],
  });
  const page1 = await context.newPage();
  const page2 = await context.newPage();

  return { context, page1, page2 };
}

/**
 * Navigate both pages to the app and wait until both reach the "Ready" state.
 */
export async function openAppOnBoth(page1: Page, page2: Page): Promise<void> {
  await Promise.all([page1.goto('/'), page2.goto('/')]);
  await Promise.all([waitForReady(page1), waitForReady(page2)]);
  // Both local webcams should be initialized by now.
  await Promise.all([expectLocalVideoReady(page1), expectLocalVideoReady(page2)]);
}

/**
 * Poll the local signaling server's /health endpoint until it reports zero
 * connected peers and zero available (waiting) connections.
 *
 * The signaling server is shared across tests (reuseExistingServer: true).
 * When a test closes its browser context, the WebSocket `close` events fire
 * asynchronously and the server's DisconnectPeer use case runs as a
 * fire-and-forget promise. If the next test starts before those disconnects
 * are processed, its peers can cross-match with "ghost" peers from the
 * previous test. Waiting for the server to be idle makes the suite
 * deterministic.
 */
export async function waitForServerIdle(timeout = 5000): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          const res = await fetch('http://localhost:3001/health');
          const data = (await res.json()) as { peers: number; available: number };
          return data.peers + data.available;
        } catch {
          return -1;
        }
      },
      { timeout },
    )
    .toBe(0);
}
