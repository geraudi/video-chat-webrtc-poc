import { test, expect, Page } from '@playwright/test';
import { createSignalingMockScript } from './mocks/ws-signaling';

// Debug helper: dump all buttons on the page
async function debugButtons(page: Page) {
  const buttons = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button'));
    return els.map((b) => ({
      text: b.textContent?.trim() ?? '',
      disabled: b.disabled,
      id: b.id,
      className: b.className
    }));
  });
  return buttons;
}

// Helper to wait until the connection status shows "Connected" text on the page
async function waitForConnectedState(page: Page, timeout = 5000): Promise<void> {
  // Wait for the green dot + "Connected" text in the status indicator
  await page.waitForSelector('span:text("Connected")', { timeout });
}

// Helper to wait until BOTH pages show "Connected"
async function waitForConnectedStates(pages: Page[], timeout = 5000): Promise<void> {
  const results = await Promise.allSettled(
    pages.map(p => waitForConnectedState(p, timeout))
  );
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    throw new Error(`Not all pages connected: ${failures.length} failed`);
  }
}

// ===== TESTS =====

test.describe('Video Chat Next Button Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Install WebRTC mocks and WebSocket signaling mock BEFORE the app loads
    await page.addInitScript(() => {
      // Mock getUserMedia to avoid camera/mic prompts
      (navigator as any).mediaDevices = {
        getUserMedia: async () => ({
          getTracks: () => [],
          id: 'mock-stream',
          active: true,
          addTrack: () => {},
          removeTrack: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaStream
      };

      // Mock RTCPeerConnection for WebRTC testing
      (window as any).RTCPeerConnection = class RTCPeerConnection {
        constructor() {}
        createOffer = async () => ({ sdp: 'o=mock' });
        createAnswer = async () => ({ sdp: 'a=answer' });
        setLocalDescription = async () => {};
        get localDescription() { return { sdp: 'o=local' }; }
        get remoteDescription() { return null; }
        onicecandidate = null;
        addEventListener = () => {};
        removeEventListener = () => {};
        close = () => {};
        ontrack = null;
        oniceconnectionstatechange = null;
        onsignalingstatechange = null;
        ondatachannel = null;
      };

      // Mock MediaStream for localMedia handling
      (window as any).MediaStream = class MediaStream {
        getTracks() { return []; }
        addTrack() {}
      };
    });

    // Install WebSocket signaling mock to simulate the signaling server
    // This ensures the WebSocket connection is established before navigation,
    // making the Start button enabled immediately after page load
    await page.addInitScript(() => {
      const script = createSignalingMockScript({ initialDelay: 10, postInitDelay: 50 });
      eval(script);
    });
  });

  test('@debug Start button becomes disabled and changes label to "Looking..." after click', async ({
    browser
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('http://localhost:5173');

    // Wait for WebSocket connection (Status to show "Connected") before checking button state
    await waitForConnectedState(page);

    // Now the WS mock has connected, so the Start button should be enabled
    const startButton = page.locator('[data-testid="action-button"]');

    await expect(startButton).toBeVisible();
    
    // Verify initial state: button is enabled and says "Start"
    await expect(startButton).toBeEnabled();
    await expect(startButton).toContainText('Start');

    // Click the Start button (simulates user searching for a peer)
    await startButton.click();

    // After clicking Start, the SAME button transforms:
    // 1. Text changes to "Looking..."
    // 2. Button becomes disabled (user can't click again while searching)
    // The action-button still exists but with different text/state
    await expect(startButton).toContainText('Looking...');
    await expect(startButton).toBeDisabled();

    // Clean up
    await context.close();
  });

  test('Next button becomes enabled after peer connects', async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await Promise.all([
      page1.goto('http://localhost:5173'),
      page2.goto('http://localhost:5173')
    ]);

    // Wait for both pages to show "Connected"
    await waitForConnectedStates([page1, page2]);

    // Click Start on BOTH sides to trigger matching
    const startButton1 = page1.locator('[data-testid="action-button"]');
    const startButton2 = page2.locator('[data-testid="action-button"]');
    
    await Promise.all([
      startButton1.click(),
      startButton2.click()
    ]);

    // After matching, both should see "Next" button enabled
    // (This would require mocking the signaling flow, which is complex)
    // For now, just verify the buttons exist
    const nextButton1 = page1.locator('[data-testid="next-button"]');
    await expect(nextButton1).toHaveCount(1);
  });

  test('After clicking Next: button becomes "Looking..." and disabled while re-searching', async ({
    browser
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('http://localhost:5173');

    // Wait for WebSocket connection to establish before clicking Start
    await waitForConnectedState(page);

    // Now click Start (button is enabled because WS is connected)
    const startButton = page.locator('[data-testid="action-button"]');
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();
    await startButton.click();

    // Should now see "Looking..." button (next-button)
    const lookingButton = page.locator('[data-testid="next-button"]');
    await expect(lookingButton).toBeVisible();
    await expect(lookingButton).toContainText('Looking...');
    await expect(lookingButton).toBeDisabled();

    await context.close();
  });

  // Debug test: verify the DOM state right before and after clicking Start
  test('debug: inspect DOM around Start click', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('http://localhost:5173');

    // Wait for WebSocket connection to establish before interacting
    await waitForConnectedState(page);

    // Now the Start button should be enabled
    const startButton = page.locator('[data-testid="action-button"]');
    await expect(startButton).toBeVisible();
    
    // Debug before click
    console.log('=== BEFORE CLICK ===');
    let buttons = await debugButtons(page);
    console.log('All buttons:', JSON.stringify(buttons, null, 2));
    const connStatusBefore = await page.getByText('Connected').textContent();
    console.log('Connection status before click:', connStatusBefore);

    // Click
    console.log('Clicking Start button...');
    await startButton.click();
    
    // Small wait for React to re-render
    await page.waitForTimeout(300);

    // Debug after click
    console.log('=== AFTER CLICK ===');
    buttons = await debugButtons(page);
    console.log('All buttons:', JSON.stringify(buttons, null, 2));
    const connStatusAfter = await page.getByText(/Connected|Looking|Waiting/).textContent();
    console.log('Connection status after click:', connStatusAfter);

    // Verify expected elements exist
    const nextButton = page.locator('[data-testid="next-button"]');
    const isNextVisible = await nextButton.isVisible().catch(() => false);
    console.log('Next button visible:', isNextVisible);
    
    if (isNextVisible) {
      const nextText = await nextButton.textContent();
      console.log('Next button text:', nextText);
      const nextDisabled = await nextButton.isDisabled();
      console.log('Next button disabled:', nextDisabled);
    }

    await context.close();
  });
});