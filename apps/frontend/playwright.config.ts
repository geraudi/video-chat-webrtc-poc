import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Two `webServer` entries:
 * - The first starts the REAL local WebSocket signaling server
 *   (`@repo/signaling-ws` on ws://localhost:3001). E2E tests exercise the
 *   actual signaling/matching logic end-to-end — no client-side WS mock.
 * - The second starts the Vite dev server for the frontend on :5173.
 *
 * WebRTC is NOT mocked. Tests run against the real browser RTCPeerConnection,
 * real ICE/SDP negotiation, and real media (via Chromium's fake device mode).
 */
export default defineConfig({
  testDir: './e2e',
  // Tests share a SINGLE in-memory signaling server (ws://localhost:3001).
  // Parallel execution would cause peers from different tests to cross-match,
  // making results non-deterministic. Serialise the entire suite.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  // Real WebRTC involves ICE candidate gathering, SDP negotiation, and
  // connection state transitions that are inherently slower than mocked
  // tests. 60s per test gives comfortable headroom for two-page P2P flows
  // including teardown + re-match cycles.
  timeout: 60_000,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    // Grant camera/microphone permissions so getUserMedia succeeds without
    // any permission dialog (deterministic headless/CI runs).
    permissions: ['camera', 'microphone'],
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Real WebRTC with deterministic fake media: Chromium synthesises a
        // fake camera + microphone feed, so no physical devices are needed and
        // the media path is reproducible. The flags also bypass the permission
        // prompt (UI auto-accepts), complementing `permissions` above.
        launchOptions: {
          args: [
            // Auto-accept the camera/mic permission prompt (deterministic,
            // complements the `permissions` config above).
            '--use-fake-ui-for-media-stream',
            // Use Chromium's built-in fake video/audio capture device so
            // getUserMedia succeeds without physical hardware. This is a
            // boolean flag (NOT a key=value flag).
            '--use-fake-device-for-media-stream',
          ],
        },
      },
    },
  ],

  webServer: [
    {
      // Real local WebSocket signaling server.
      command:
        '../../packages/signaling-ws/node_modules/.bin/tsx ../../packages/signaling-ws/src/local-server/index.ts',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
    },
    {
      // Frontend Vite dev server.
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
    },
  ],
});