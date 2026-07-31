import { expect, test } from '@playwright/test';
import {
  SIGNALING_WS_URL,
  waitForEmptyMatchingPool
} from './support/signaling-server';
import { VideoChatApp } from './support/video-chat-app';
import {
  readConnectionStats,
  readPeerConnection
} from './support/webrtc-probe';

/**
 * The product's core user journey, exercised end to end with nothing simulated:
 * two independent browser contexts, Chromium's real RTCPeerConnection, real SDP
 * offer/answer, real ICE negotiation, real media (fake capture device) and the
 * real Cloudflare WebSocket signaling worker started by playwright.config.ts.
 */
test('two peers reach a connected WebRTC call through the real signaling server', async ({
  browser
}) => {
  await test.step('the signaling server matching pool is empty', () =>
    waitForEmptyMatchingPool());

  const peers: VideoChatApp[] = [];

  try {
    const alice = await test.step('user A opens the application', async () => {
      const app = await VideoChatApp.open(browser, 'A');
      peers.push(app);
      return app;
    });

    const bob = await test.step('user B opens the application', async () => {
      const app = await VideoChatApp.open(browser, 'B');
      peers.push(app);
      return app;
    });

    await test.step('both clients are connected to the signaling server', async () => {
      // Each client opened its own socket to the local signaling server, so
      // every frame recorded below really crossed it. Deliberately asserted per
      // peer: the server's total connection count is shared state (a dev tab on
      // :5173, or peers still disconnecting from an earlier run, all count),
      // so no arithmetic on it can be reliable.
      // Asserted against the list of every socket the page opened, which is
      // never null: the failure then prints what the app actually connected to
      // (a URL other than the local server means VITE_SIGNALING_URL leaked in
      // from the environment) instead of an opaque
      // "received value must not be null".
      for (const peer of [alice, bob]) {
        expect(peer.signaling.observedUrls().join(', ')).toContain(
          SIGNALING_WS_URL
        );
      }
    });

    await test.step('user A starts the connection', async () => {
      await alice.clickStart();
      await alice.expectSearching();
    });

    await test.step('user B starts the connection', async () => {
      await bob.clickStart();
    });

    // The caller is whoever the server matched second — it answers the START
    // that found a waiting stranger. Derived from the recorded frames rather
    // than assumed, so the assertions hold whichever way the server matched.
    const [caller, callee] =
      await test.step('signaling messages are exchanged through the real server', async () => {
        for (const peer of [alice, bob]) {
          await expect
            .poll(() => peer.signaling.actions('sent'), {
              message: `${peer.name} should send its start request`
            })
            .toContain('start');
          await expect
            .poll(() => peer.signaling.actions('received'), {
              message: `${peer.name} should be matched by the server`
            })
            .toContain('initOffer');
        }

        await expect
          .poll(
            () =>
              [alice, bob].filter(peer =>
                peer.signaling.actions('sent').includes('videoOffer')
              ).length,
            { message: 'exactly one peer should send the SDP offer' }
          )
          .toBe(1);

        const offerer = [alice, bob].find(peer =>
          peer.signaling.actions('sent').includes('videoOffer')
        );
        const answerer = [alice, bob].find(peer => peer !== offerer);
        if (!offerer || !answerer) throw new Error('no offering peer recorded');

        await expect
          .poll(() => answerer.signaling.actions('sent'), {
            message: `${answerer.name} should answer the SDP offer`
          })
          .toContain('videoAnswer');
        await expect
          .poll(() => offerer.signaling.actions('received'), {
            message: `${offerer.name} should receive the SDP answer`
          })
          .toContain('videoAnswer');

        // ICE candidates are relayed by the same server, in both directions.
        for (const peer of [offerer, answerer]) {
          await expect
            .poll(() => peer.signaling.actions('sent'), {
              message: `${peer.name} should send its ICE candidates`
            })
            .toContain('newIceCandidate');
          await expect
            .poll(() => peer.signaling.actions('received'), {
              message: `${peer.name} should receive the peer's ICE candidates`
            })
            .toContain('newIceCandidate');
        }

        return [offerer, answerer];
      });

    await test.step('WebRTC negotiation completes on both peers', async () => {
      for (const peer of [caller, callee]) {
        await expect
          .poll(
            async () => (await readPeerConnection(peer.page))?.signalingState,
            { message: `${peer.name} should settle its signaling state` }
          )
          .toBe('stable');
      }

      // The negotiated descriptions mirror each other: proof the SDP the caller
      // produced is the SDP the callee consumed, and vice versa.
      expect(await readPeerConnection(caller.page)).toMatchObject({
        localDescriptionType: 'offer',
        remoteDescriptionType: 'answer'
      });
      expect(await readPeerConnection(callee.page)).toMatchObject({
        localDescriptionType: 'answer',
        remoteDescriptionType: 'offer'
      });
    });

    await test.step('both clients reach the connected state', async () => {
      for (const peer of [caller, callee]) {
        await expect
          .poll(
            async () => (await readPeerConnection(peer.page))?.connectionState,
            {
              message: `${peer.name} should reach a connected peer connection`,
              timeout: 30_000
            }
          )
          .toBe('connected');

        const state = await readPeerConnection(peer.page);
        expect(['connected', 'completed']).toContain(state?.iceConnectionState);

        // Media really flows: RTP is arriving from the peer.
        await expect
          .poll(
            async () => (await readConnectionStats(peer.page))?.bytesReceived,
            {
              message: `${peer.name} should receive RTP from its peer`,
              timeout: 30_000
            }
          )
          .toBeGreaterThan(0);

        // ...over a direct path. Both ends are on this machine, so ICE nominates
        // a locally reachable pair (`host`, or `prflx` when the peer's address
        // is learnt from the connectivity check itself) — never a TURN `relay`.
        const stats = await readConnectionStats(peer.page);
        const pair = stats?.selectedCandidatePair;
        expect(['host', 'prflx', 'srflx']).toContain(pair?.localCandidateType);
        expect(['host', 'prflx', 'srflx']).toContain(pair?.remoteCandidateType);
      }
    });

    await test.step('the UI reflects the connection state', async () => {
      for (const peer of [caller, callee]) {
        await peer.expectConnected();
        await peer.expectRemoteStreamLive();
        await peer.expectLocalCameraLive();
      }
    });
  } finally {
    await Promise.all(peers.map(peer => peer.close()));
  }
});
