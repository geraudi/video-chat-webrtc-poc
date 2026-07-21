// Support both local development and deployed modes
const isLocal = import.meta.env.VITE_LOCAL_MODE === 'true';

const config = {
  // Backend config
  signalingServer: {
    REGION: isLocal ? 'local' : 'us-east-1',
    URL: isLocal
      ? (window.location.protocol === 'https:' ? 'wss' : 'ws') +
        '://' +
        window.location.hostname +
        ':3001'
      : import.meta.env.VITE_SIGNALING_URL || '',
  },
};

export default config;
