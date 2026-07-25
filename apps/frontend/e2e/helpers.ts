import { test, expect, Page, Browser } from '@playwright/test';
import { webrtcMockScript } from './mocks/webrtc.js';

/**
 * WebRTC helpers for e2e testing.
 */

// Locator constants for maintainability
const selectors = {
  actionButton: 'button:has-text("Start"), button:has-text("Next")',
  startButton: 'button:has-text("Start")',
  nextButton: 'button:has-text("Next")',
  hangUpButton: 'button:has-text("Hang Up")',
  localVideo: '[data-testid="local-video"]',
  strangerVideo: '[data-testid="stranger-video"]',
  connectionStatus: '[data-testid="connection-status"]',
} as const;

/**
 * Inject WebRTC mocks into a page before navigation.
 */
export const setupWebRtcMocks = async (page: Page): Promise<void> => {
  await page.addInitScript(webrtcMockScript);
};

/**
 * Navigate both pages to the app simultaneously.
 */
export const navigateToApp = async (page1: Page, page2: Page): Promise<void> => {
  await Promise.all([page1.goto('/'), page2.goto('/')]);
};

/**
 * Wait for both pages to show the Start/Next button.
 */
export const waitForStartButton = async (page1: Page, page2: Page): Promise<void> => {
  await Promise.all([
    expect(page1.locator(selectors.actionButton)).toBeVisible(),
    expect(page2.locator(selectors.actionButton)).toBeVisible(),
  ]);
};

/**
 * Wait for the button to be disabled (Next button disabled state).
 */
export const waitForDisabledButton = async (page1: Page, page2: Page): Promise<void> => {
  await Promise.all([
    expect(page1.locator(selectors.actionButton)).toBeDisabled(),
    expect(page2.locator(selectors.actionButton)).toBeDisabled(),
  ]);
};

/**
 * Click the action button (Start or Next) on both pages.
 */
export const clickActionBtn = async (page1: Page, page2: Page): Promise<void> => {
  await Promise.all([
    page1.locator(selectors.actionButton).click(),
    page2.locator(selectors.actionButton).click(),
  ]);
};

/**
 * Click "Start" on both pages and wait for video chat UI.
 */
export const startVideoChat = async (
  page1: Page,
  page2: Page,
  timeout = 10000,
): Promise<void> => {
  await clickActionBtn(page1, page2);

  await Promise.all([
    expect(page1.locator(selectors.localVideo)).toBeVisible({ timeout }),
    expect(page2.locator(selectors.localVideo)).toBeVisible({ timeout }),
  ]);
};

/**
 * Hang up and reconnect both peers.
 */
export const hangUpAndReconnect = async (
  page1: Page,
  page2: Page,
  timeout = 10000,
): Promise<void> => {
  // Click hang up buttons
  await Promise.all([
    page1.locator(selectors.hangUpButton).click().catch(() => {}),
    page2.locator(selectors.hangUpButton).click().catch(() => {}),
  ]);

  // Click start again
  await clickActionBtn(page1, page2);

  // Wait for reconnection
  await Promise.all([
    expect(page1.locator(selectors.localVideo)).toBeVisible({ timeout }),
    expect(page2.locator(selectors.localVideo)).toBeVisible({ timeout }),
  ]);
};

/**
 * Verify video elements exist on both pages.
 */
export const verifyVideoPresent = async (
  page1: Page,
  page2: Page,
): Promise<void> => {
  const [count1, count2] = await Promise.all([
    page1.locator(selectors.localVideo).count(),
    page2.locator(selectors.localVideo).count(),
  ]);

  expect(count1).toBeGreaterThan(0);
  expect(count2).toBeGreaterThan(0);
};

/**
 * Create a pair of WebRTC-mocked browser contexts.
 */
export const createMockedPeerPair = async (
  browser: Browser,
): Promise<{
  context1: any;
  context2: any;
  page1: Page;
  page2: Page;
}> => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  await setupWebRtcMocks(page1);
  await setupWebRtcMocks(page2);

  return { context1, context2, page1, page2 };
};

/**
 * Clean up browser contexts.
 */
export const cleanupPeerPair = async (
  context1: any,
  context2: any,
): Promise<void> => {
  await context1.close();
  await context2.close();
};

/**
 * Extended test fixture with WebRTC mocking support.
 */
export const e2eTest = test.extend<{ peers: Awaited<ReturnType<typeof createMockedPeerPair>> }>({
  peers: async ({ browser }, use) => {
    const peers = await createMockedPeerPair(browser);
    await use(peers);
    await cleanupPeerPair(peers.context1, peers.context2);
  },
});

export { selectors };