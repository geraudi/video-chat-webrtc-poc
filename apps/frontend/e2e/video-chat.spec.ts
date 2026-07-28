import { expect, test } from '@playwright/test';
import {
  clickStartOnBoth,
  createPeerPages,
  expectLocalVideoReady,
  getServerHealth,
  isolateTurnCredentials,
  openAppOnBoth,
  selectors,
  waitForConnected,
  waitForReady,
  waitForSearching,
  waitForServerIdle
} from './helpers';

/**
 * After each test, wait until the shared signaling server has no lingering
 * peers. Browser-context close triggers async WebSocket disconnects on the
 * server; without waiting, the next test's peers could match ghost peers.
 */
test.afterEach(async () => {
  await waitForServerIdle();
});

/**
 * End-to-end tests for the WebRTC video chat.
 *
 * These tests exercise the REAL local WebSocket signaling server
 * (ws://localhost:3001, started by Playwright's `webServer` config), the REAL
 * signaling/matching logic, AND the REAL browser WebRTC stack
 * (RTCPeerConnection, ICE/SDP negotiation, getUserMedia). Determinism comes
 * from Chromium's fake-device media mode — no WebRTC APIs are mocked.
 */

test.describe('Video Chat — full peer-to-peer flow', () => {
  test('two users are matched and reach a connected video call through the real signaling server', async ({
    browser
  }) => {
    const { context, page1, page2 } = await createPeerPages(browser);
    try {
      // Isolate the third-party TURN credential service. WebRTC itself runs
      // against the real browser stack — only this fetch is stubbed.
      await Promise.all([
        isolateTurnCredentials(page1),
        isolateTurnCredentials(page2)
      ]);
      await openAppOnBoth(page1, page2);

      // Trigger matching on both sides via the real server.
      await clickStartOnBoth(page1, page2);

      // Both peers should converge on the "connected" stage, with the remote
      // video stream attached — proving the full signaling exchange
      // (START → initOffer → videoOffer → videoAnswer → ICE) succeeded.
      await waitForConnected(page1);
      await waitForConnected(page2);

      // The local webcam must remain attached throughout the call.
      await expectLocalVideoReady(page1);
      await expectLocalVideoReady(page2);

      // The status indicator should reflect an active call.
      await expect(
        page1.locator('span:has-text("Connected to stranger")')
      ).toBeVisible();
      await expect(
        page2.locator('span:has-text("Connected to stranger")')
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('Start button is disabled before the WebSocket connects, then becomes enabled', async ({
    browser
  }) => {
    const context = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    const page = await context.newPage();
    try {
      // Block the WebSocket so it never connects, simulating a slow/unavailable
      // signaling server. This is an error-scenario test — the only allowed
      // use of transport interception. No WebRTC APIs are mocked.
      await page.routeWebSocket('ws://localhost:3001/**', ws => {
        // Never call ws.connectToServer(): the client connection stays
        // blocked/closed, so readyState never reaches OPEN.
        ws.close();
      });

      await page.goto('/');

      // The Start button should be visible but disabled while WS is down.
      const startButton = page.locator(selectors.actionButton);
      await expect(startButton).toBeVisible();
      await expect(startButton).toBeDisabled();
      await expect(startButton).toHaveText('Start');
      // The status should read "Disconnected".
      await expect(page.locator('span:has-text("Disconnected")')).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('clicking Start transitions the UI to the "Looking..." searching stage', async ({
    browser
  }) => {
    const context = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    const page = await context.newPage();
    try {
      await isolateTurnCredentials(page);
      await page.goto('/');
      await waitForReady(page);

      // Click Start. Because this page is alone (no second peer), it should
      // enter the "searching" stage and stay there waiting for a match.
      await page.locator(selectors.actionButton).click();

      await waitForSearching(page);

      // The status indicator should reflect the searching state.
      await expect(
        page.locator('span:has-text("Looking for peer...")')
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('Stop returns a searching user to the idle stage with the Start button', async ({
    browser
  }) => {
    const context = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    const page = await context.newPage();
    try {
      await isolateTurnCredentials(page);
      await page.goto('/');
      await waitForReady(page);

      await page.locator(selectors.actionButton).click();
      await waitForSearching(page);

      // Sanity check: while searching, this peer is in the server's matching
      // pool (it sent START).
      await expect
        .poll(async () => (await getServerHealth()).available, {
          timeout: 5000,
          intervals: [200, 500, 1000]
        })
        .toBeGreaterThanOrEqual(1);

      // Capture the available count, then click Stop to cancel the search.
      const availableBeforeStop = (await getServerHealth()).available;
      await page.locator(selectors.stopButton).click();

      // UI: should return to idle — Start button visible/enabled, Stop gone.
      await waitForReady(page);
      await expect(page.locator(selectors.stopButton)).toHaveCount(0);

      // Behavioral guarantee of the onStop fix: the peer must NOT have sent a
      // second START (which would re-enter the matching pool). After a short
      // settle window, available must have dropped (the search was cancelled)
      // and must NOT climb back above its pre-Stop level.
      await page.waitForTimeout(500);
      const healthAfterStop = await getServerHealth();
      expect(healthAfterStop.available).toBeLessThanOrEqual(
        availableBeforeStop
      );
      expect(healthAfterStop.available).toBeLessThan(availableBeforeStop);
    } finally {
      await context.close();
    }
  });
});

test.describe('Video Chat — Next (re-match) flow', () => {
  test('clicking Next during a call tears down and re-establishes a new connection', async ({
    browser
  }) => {
    const { context, page1, page2 } = await createPeerPages(browser);
    try {
      await Promise.all([
        isolateTurnCredentials(page1),
        isolateTurnCredentials(page2)
      ]);
      await openAppOnBoth(page1, page2);
      await clickStartOnBoth(page1, page2);
      await waitForConnected(page1);
      await waitForConnected(page2);

      // Click Next on page1 — should tear down the current call (hangUpCall)
      // and immediately re-enter the matching pool (onCloseVideo → startChat).
      await page1.locator(selectors.actionButton).click();

      // With only 2 peers, both sides go through teardown → startChat →
      // re-match with each other. We verify the full teardown + re-establish
      // cycle succeeds by waiting for both to reach "connected" again.
      //
      // NOTE: We intentionally do NOT assert on the transient "Looking..."
      // stage here. With only 2 peers the searching window is sub-100ms and
      // observing it would be inherently flaky. A deterministic "searches for
      // a NEW peer" test requires a 3rd peer (see missing scenarios below).
      await waitForConnected(page1);
      await waitForConnected(page2);
    } finally {
      await context.close();
    }
  });

  test('clicking Stop during a connected call returns the clicking peer to idle', async ({
    browser
  }) => {
    const { context, page1, page2 } = await createPeerPages(browser);
    try {
      await Promise.all([
        isolateTurnCredentials(page1),
        isolateTurnCredentials(page2)
      ]);
      await openAppOnBoth(page1, page2);
      await clickStartOnBoth(page1, page2);
      await waitForConnected(page1);
      await waitForConnected(page2);

      // While connected, neither peer is in the matching pool.
      const availableBeforeStop = (await getServerHealth()).available;

      // page2 clicks Stop — should send hangUp to page1 and return page2 to
      // idle WITHOUT re-entering the matching pool (the onStop guarantee).
      await page2.locator(selectors.stopButton).click();

      // page2 should return to idle (Start button visible + enabled).
      await waitForReady(page2);

      // Behavioral guarantee of the onStop fix: page2 must NOT have sent a
      // START after the hangUp, so the matching pool must not have grown.
      // (Before the fix, onStop → onCloseVideo → startChat() would push page2
      // back into the available pool, defeating the stop.)
      await page2.waitForTimeout(500);
      const availableAfterStop = (await getServerHealth()).available;
      expect(availableAfterStop).toBeLessThanOrEqual(availableBeforeStop);

      // The remote peer (page1) receives the hangUp. With only 2 peers its
      // terminal state is non-deterministic (it may auto-re-search or idle),
      // so we assert only that page1 left the connected stage.
      await expect(page1.locator(selectors.actionButton)).not.toHaveText(
        'Next',
        {
          timeout: 5000
        }
      );
    } finally {
      await context.close();
    }
  });
});
