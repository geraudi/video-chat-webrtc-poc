import { defineConfig, devices } from '@playwright/test';

/**
 * E2E configuration for the real WebRTC stack.
 *
 * Nothing is mocked. Playwright boots the real local WebSocket signaling server
 * (`@repo/signaling-ws` on :3001) and the Vite dev server (:5173); the tests then
 * drive Chromium's own RTCPeerConnection, ICE and SDP machinery. Determinism
 * comes from Chromium's fake capture device, not from stubs.
 *
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  // All peers share one in-memory signaling server with a single matching pool,
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
    baseURL: 'http://localhost:5173',
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
      // Real signaling server; readiness is gated on its /health endpoint.
      command: 'pnpm --filter @repo/signaling-ws dev',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000
    }
  ]
});
