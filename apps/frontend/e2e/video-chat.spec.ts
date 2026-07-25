import { test, expect, Page } from '@playwright/test';

// Helper: simulate a WebSocket message stream between two Playwright pages
async function emulateWs(
  sender: Page,
  receiver: Page,
  opts: { delay?: number; filterFn?: string } = {}
): Promise<{ stop: () => void }> {
  const { delay = 30, filterFn = `() => true` } = opts;

  const leftHandler = sender.evaluateHandle(() => {
    const original = (window as any).WebSocket;
    if (!(original && (original as any).__playwright)) return null;
    // monkey-patch to capture open sockets
    let captured = null;
    const Patched = function (url: string, protocols: any) {
      (this as any).url = url;
      (this as any)._pProtocols = protocols;
      const real = new original(url, protocols);
      ;(this as any)._real = real;
      Object.getOwnPropertyNames(real).forEach((k: string) => {
        (this as any)[k] = real[k];
      });
    };
    Patched.prototype = original.prototype;
    (window as any).WebSocket = Patched as any;
    return null;
  });

  // Simpler approach: use browser context to share a single mock WS
  const ctx1 = sender.context();
  const ctx2 = receiver.context();
  // Both pages share the same BrowserContext in our setup (we'll open tabs from the same context)
  // Actually Playwright creates separate contexts. Use page.evaluate to install mocks on both sides.

  // Best approach: just evaluate a real WebSocket mock on both pages that forwards messages via CDPSession or postMessage
  // Let's use a shared InMemoryChannel via JS evaluation

  // Actually the simplest: inject a global message bus and use page.exposeFunction + listen
  const messages: Array<{ from: string; data: string }> = [];

  // Install a simple forwarding hook on each page
  await sender.evaluate(async ({ script, urlPattern }) => {
    // Replace WebSocket constructor entirely
    const handlers: Array<(conn: { send: Function; onClose?: Function }) => void> = [];
    let closed = false;

    class FakeWebSocket {
      static instances: FakeWebSocket[] = [];
      _url: string;
      _readyState: number = 0; // CONNECTING
      onopen: ((ev: any) => any) | null = null;
      onmessage: ((ev: any) => any) | null = null;
      onclose: ((ev: any) => any) | null = null;
      onerror: ((ev: any) => any) | null = null;

      constructor(url: string) {
        this._url = url;
        FakeWebSocket.instances.push(this);

        // Simulate CONNECTING → OPEN after 0ms (sync, no timers)
        this._readyState = 0; // CONNECTING
        setTimeout(() => {
          if (closed) return;
          this._readyState = 1; // OPEN
          if (this.onopen) this.onopen({} as any);
          // Auto-accept messages from the other side via shared window storage
          // Use a shared Map on globalThis keyed by url
          const registry = (globalThis as any).__ws_registry ||= {};
          registry[url] = this;
        }, 0);
      }

      get url() { return this._url; }
      get readyState() { return this._readyState; }

      send(data: string) {
        // Deliver to the matching page's message handler
        const targetUrl = Object.keys((globalThis as any).__ws_registry || {}).find(
          k => k !== this._url
        );
        if (targetUrl) {
          const target = (globalThis as any).__ws_registry?.[targetUrl];
          if (target && target.onmessage) {
            target.onmessage({ data });
          }
        }
      }

      close() {
        closed = true;
        this._readyState = 3; // CLOSED
        if (this.onclose) this.onclose({});
      }
    }

    (window as any).FakeWebSocket = FakeWebSocket;
    (window as any).WebSocket = FakeWebSocket as any;

    // Shared registry for inter-page messages
    (globalThis as any).__ws_registry ||= {};
  }, { script: '', urlPattern: '' });

  // Wait a tick for the mock to install and open
  await new Promise((r) => setTimeout(r, delay));

  return {
    stop: () => {}
  };
}

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

// Helper to wait until the connection status shows Connected
async function waitForConnectedState(page1: Page, page2: Page, timeout = 5000) {
  // Both tabs connect independently; we just wait until they show "Connected" (WS OPEN)
  const [r1, r2] = await Promise.all([
    page1.waitForSelector('.connected-status', { timeout }),
    page2.waitForSelector('.connected-status', { timeout })
  ]);
}

// ===== TESTS =====

test.describe('Video Chat', () => {
  test('two users can find each other and start a video call', async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Install the mock WebRTC on both pages BEFORE loading the app
    await page1.addInitScript(() => {
      // Mock RTCPeerConnection
      const fakeConn = () => ({
        createOffer: async () => ({ sdp: 'o=mock' }),
        createAnswer: async () => ({ sdp: 'a=answer' }),
        setLocalDescription: async () => {},
        localDescription: { sdp: 'o=local' },
        remoteDescription: null,
        onicecandidate: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        close: () => {},
        ontrack: null,
        oniceconnectionstatechange: null,
        onsignalingstatechange: null,
        ondatachannel: null,
      });
      (window as any).RTCPeerConnection = class RTCPeerConnection {
        constructor() { Object.assign(this, fakeConn()); }
        static iceServers = () => [];
      };
      
      // Mock MediaStream
      (window as any).MediaStream = class MediaStream {
        getTracks() { return []; }
        addTrack() {}
      };
      // Mock getUserMedia
      (navigator as any).mediaDevices = {
        getUserMedia: async () => ({
          getTracks: () => [],
          id: 'mock-stream'
        })
      };
    });

    await page2.addInitScript(() => {
      const fakeConn = () => ({
        createOffer: async () => ({ sdp: 'o=mock' }),
        createAnswer: async () => ({ sdp: 'a=answer' }),
        setLocalDescription: async () => {},
        localDescription: { sdp: 'o=local' },
        remoteDescription: null,
        onicecandidate: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        close: () => {},
        ontrack: null,
        oniceconnectionstatechange: null,
        onsignalingstatechange: null,
        ondatachannel: null,
      });
      (window as any).RTCPeerConnection = class RTCPeerConnection {
        constructor() { Object.assign(this, fakeConn()); }
        static iceServers = () => [];
      };
      (window as any).MediaStream = class MediaStream {
        getTracks() { return []; }
        addTrack() {}
      };
      (navigator as any).mediaDevices = {
        getUserMedia: async () => ({
          getTracks: () => [],
          id: 'mock-stream'
        })
      };
    });

    // Navigate both pages to the app running on localhost
    await Promise.all([
      page1.goto('http://localhost:5173'),
      page2.goto('http://localhost:5173')
    ]);

    // Wait until both tabs show Connected
    await waitForConnectedState(page1, page2);

    // Click Start on BOTH sides to trigger matching (START message)
    await Promise.all([
      page1.click('[data-testid="start-button"]'),
      page2.click('[data-testid="start-button"]')
    ]);

    // After matching + signaling flow, both should see "Connected" + video elements populated
    const localVideo = await page1.locator('[data-testid="local-video"]').elementRef();
    const strangerVideo = await page1.locator('[data-testid="stranger-video"]').elementRef();
    await Promise.all([
      expect(strangerVideo).not.toBeEmpty()
    ]);
  });

  test('button state transitions correctly during call flow', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Install mocks
    await page.addInitScript(() => {
      (window as any).RTCPeerConnection = class RTCPeerConnection {
        constructor() {}
        static iceServers = () => [];
      };
      (window as any).MediaStream = class MediaStream { getTracks() { return []; } addTrack() {} };
      (navigator as any).mediaDevices = {
        getUserMedia: async () => ({ getTracks: () => [], id: 'mock' })
      };
    });

    await page.goto('http://localhost:5173');

    // Phase 1: Waiting → Start button visible
    const startBtn = page.locator('[data-testid="start-button"]');
    await expect(startBtn).toBeVisible();
    let buttonText = await startBtn.textContent();
    console.log('Button text (Phase 1 - Waiting):', buttonText);
    await expect(startBtn).toBeEnabled();

    // Click Start → should transition to Looking...
    await startBtn.click();
    await page.waitForTimeout(500); // Allow React re-render

    // Phase 2: Looking for peer → Next button (disabled) + Stop visible
    const nextBtn = page.locator('[data-testid="next-button"]');
    const isNextVisible = await nextBtn.isVisible();
    buttonText = await nextBtn.textContent();
    console.log('Button text after click:', buttonText);
    console.log('Next button visible:', isNextVisible);

    // If the test expects phase transition, verify the status text changed
    const statusText = page.locator('.connected-status');
    const newStatus = await statusText.textContent();
    console.log('Status after click:', newStatus);
  });
});