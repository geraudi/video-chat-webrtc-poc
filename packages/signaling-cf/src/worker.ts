import type { Env } from './signaling-do.js';

export { SignalingDO } from './signaling-do.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (
      url.pathname === '/ws' ||
      url.pathname === '/websocket' ||
      url.pathname === '/health'
    ) {
      const stub = env.SIGNALING_DO.getByName('default');
      return stub.fetch(request);
    }

    return new Response(
      JSON.stringify({
        name: 'webrtc-signaling',
        endpoints: { ws: '/ws' }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
