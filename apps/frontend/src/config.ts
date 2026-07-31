// Support both local development and deployed modes.
// Defaults to local mode (Cloudflare Worker via wrangler dev on :8787);
// set VITE_LOCAL_MODE=false to use the deployed Worker URL (VITE_SIGNALING_URL).
const isLocal = import.meta.env.VITE_LOCAL_MODE !== 'false';

const config = {
  signalingServer: {
    URL: isLocal
      ? `ws://${window.location.hostname}:8787/ws`
      : import.meta.env.VITE_SIGNALING_URL || ''
  }
};

export default config;
