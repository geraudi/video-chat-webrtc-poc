import { defineConfig, devices } from '@playwright/test';

/**
 * E2E configuration for the real WebRTC stack.
 *
 * Nothing is mocked. Playwright boots the real Cloudflare signaling worker
 * (`@repo/signaling-cf` via `wrangler dev` on :8787) and the Vite dev server
 * (:5173); the tests then drive Chromium's own RTCPeerConnection, ICE and SDP
 * machinery. Determinism comes from Chromium's fake capture device, not from
 * stubs.
 *
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  // All peers share one signaling Durable Object with a single matching pool,
  // so concurrent tests would cross-match each other's peers.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // ICE gathering, DTLS handshake and the first RTP packets are inherently
  // slower than a mocked transport; this leaves room for the whole two-peer flow.
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['github'], ['html']] : 'html',
  use: {
    // Dedicated port, not Vite's default 5173: see the webServer entry below.
    baseURL: 'http://localhost:5273',
    // getUserMedia must succeed without a permission dialog.
    permissions: ['camera', 'microphone'],
    trace: 'on-first-retry',
    video: 'retain-on-failure'
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // Auto-accept the camera/microphone prompt.
            '--use-fake-ui-for-media-stream',
            // Synthesise camera and microphone input, so no physical device is
            // needed and the media path is reproducible run to run.
            '--use-fake-device-for-media-stream'
          ]
        }
      }
    }
  ],

  webServer: [
    {
      // Real Cloudflare signaling worker; readiness is gated on /health,
      // which the worker's Durable Object exposes.
      command: 'pnpm --filter @repo/signaling-cf dev --port 8787',
      url: 'http://localhost:8787/health',
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000
    },
    {
      // The app under test must point at the local signaling worker, so the
      // suite owns its dev server instead of inheriting one:
      // - `dev:local` forces VITE_LOCAL_MODE=true, overriding a machine's
      //   .env.local / shell VITE_SIGNALING_URL (which would otherwise send the
      //   peers to the deployed Cloudflare worker);
      // - a dedicated port with `reuseExistingServer: false` means a `pnpm dev`
      //   already running on 5173 — configured however that developer likes —
      //   is never reused. `--strictPort` turns a leftover process into an
      //   explicit port error instead of a silent fallback to another port.
      command: 'pnpm dev:local --port 5273 --strictPort',
      url: 'http://localhost:5273',
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000
    }
  ]
});
