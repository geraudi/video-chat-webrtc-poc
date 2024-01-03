const config = {
  // Backend config
  signalingServer: {
    REGION: import.meta.env.VITE_REGION,
    URL: import.meta.env.VITE_SIGNALING_SERVER_URL
  }
};

export default config;
