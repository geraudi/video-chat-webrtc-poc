// Support both local development and deployed modes
// Defaults to local mode for development; set VITE_LOCAL_MODE=false to use AWS
const isLocal = import.meta.env.VITE_LOCAL_MODE !== 'false';

const config = {
  // Backend config
  signalingServer: {
    REGION: isLocal ? 'local' : 'us-east-1',
    URL: isLocal
      ? `ws://${window.location.hostname}:8787/ws`
      : import.meta.env.VITE_SIGNALING_URL || ''
  }
};

export default config;
