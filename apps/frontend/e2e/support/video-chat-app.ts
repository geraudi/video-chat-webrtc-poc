import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page
} from '@playwright/test';
import { recordSignaling, type SignalingRecorder } from './signaling-recorder';
import { SIGNALING_WS_URL } from './signaling-server';
import { installWebRtcProbe } from './webrtc-probe';

/**
 * One peer's view of the app: locators plus the waits that express the UI state
 * machine (`idle → searching → connected`, see src/hooks/use-video-chat.ts).
 *
 * Selectors are the user-visible labels and ARIA attributes the components
 * already render, so no test-only markup is added to production code.
 */

/** Rendered by control-bar.tsx, video-chat.tsx and video-tile.tsx. */
const LABELS = {
  startButton: 'Start',
  searchingButton: 'Looking...',
  nextButton: 'Next',
  stopButton: 'Stop',
  readyStatus: 'Ready',
  searchingStatus: 'Looking for peer...',
  connectedStatus: 'Connected to stranger',
  localVideo: 'My Camera',
  remoteVideo: 'Stranger camera'
} as const;

export class VideoChatApp {
  private constructor(
    /** Human-readable peer name, used in step titles and failure messages. */
    readonly name: string,
    readonly page: Page,
    /** Frames exchanged with the real signaling server. */
    readonly signaling: SignalingRecorder,
    private readonly context: BrowserContext
  ) {}

  /**
   * Open the app as an independent peer.
   *
   * Each peer gets its own browser context: its own storage, its own permission
   * grants and — the point of the exercise — its own WebSocket connection to the
   * signaling server, so the two peers are as unrelated as two people on two
   * machines. Camera/microphone are granted here because `use.permissions` from
   * playwright.config only applies to the built-in `page` fixture, not to
   * contexts created by hand.
   */
  static async open(browser: Browser, name: string): Promise<VideoChatApp> {
    const context = await browser.newContext({
      permissions: ['camera', 'microphone']
    });
    await installWebRtcProbe(context);

    const page = await context.newPage();
    // Attach before navigating: the socket opens on first render.
    const signaling = recordSignaling(page, SIGNALING_WS_URL);
    await page.goto('/');

    const app = new VideoChatApp(name, page, signaling, context);
    await app.expectReady();
    return app;
  }

  get startButton(): Locator {
    return this.button(LABELS.startButton);
  }

  get nextButton(): Locator {
    return this.button(LABELS.nextButton);
  }

  get stopButton(): Locator {
    return this.button(LABELS.stopButton);
  }

  get localVideo(): Locator {
    return this.video(LABELS.localVideo);
  }

  get remoteVideo(): Locator {
    return this.video(LABELS.remoteVideo);
  }

  /**
   * Wait for the idle stage with a live signaling connection and a local camera:
   * the Start button is only enabled once the WebSocket is open, and the local
   * `<video>` only has a stream once getUserMedia resolved against Chromium's
   * fake device.
   */
  async expectReady(): Promise<void> {
    await expect(this.startButton).toBeEnabled();
    await expect(this.page.getByText(LABELS.readyStatus)).toBeVisible();
    await this.expectLocalCameraLive();
  }

  async clickStart(): Promise<void> {
    await this.startButton.click();
  }

  /** The searching stage: waiting for the server to find a stranger. */
  async expectSearching(): Promise<void> {
    await expect(this.page.getByText(LABELS.searchingStatus)).toBeVisible();
    await expect(this.button(LABELS.searchingButton)).toBeDisabled();
    await expect(this.stopButton).toBeVisible();
  }

  /** The connected stage: matched, negotiated, and showing the stranger. */
  async expectConnected(): Promise<void> {
    await expect(this.page.getByText(LABELS.connectedStatus)).toBeVisible();
    await expect(this.nextButton).toBeEnabled();
    await expect(this.stopButton).toBeVisible();
  }

  /** The local preview keeps its own camera stream for the whole session. */
  async expectLocalCameraLive(): Promise<void> {
    await this.expectLiveStream(this.localVideo, 'local camera');
  }

  /** The remote tile carries the stream delivered by the peer connection. */
  async expectRemoteStreamLive(): Promise<void> {
    await this.expectLiveStream(this.remoteVideo, 'remote stream');
  }

  async close(): Promise<void> {
    await this.context.close();
  }

  private button(label: string): Locator {
    return this.page.getByRole('button', { name: label, exact: true });
  }

  private video(label: string): Locator {
    return this.page.locator(`video[aria-label="${label}"]`);
  }

  /**
   * Assert a `<video>` holds a MediaStream with at least one live video track.
   * Polled because streams are attached asynchronously — getUserMedia resolving
   * for the local tile, the peer connection firing `ontrack` for the remote one.
   */
  private async expectLiveStream(video: Locator, what: string): Promise<void> {
    await expect
      .poll(() => countLiveVideoTracks(video), {
        message: `${this.name}: ${what} should carry a live video track`
      })
      .toBeGreaterThan(0);
  }
}

/** Live video tracks on the element's `srcObject`; 0 when no stream is attached. */
function countLiveVideoTracks(video: Locator): Promise<number> {
  return video.evaluate(element => {
    const stream = (element as HTMLVideoElement).srcObject;
    if (!(stream instanceof MediaStream)) return 0;

    return stream.getVideoTracks().filter(track => track.readyState === 'live')
      .length;
  });
}
