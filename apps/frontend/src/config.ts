import outputs from '../../../infra/outputs.json';

const config = {
  // Backend config
  signalingServer: {
    REGION: 'us-east-1',
    URL: outputs.apiEndpoint,
  },
};

export default config;
