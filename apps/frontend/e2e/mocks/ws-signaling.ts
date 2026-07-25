/**
 * WebSocket signaling mock for e2e testing.
 * 
 * This module provides a script to intercept WebSocket connections in the browser
 * and simulate a signaling server that responds to START messages with initOffer.
 */

/**
 * Creates a script that intercepts WebSocket connections and simulates signaling.
 * The generated JavaScript is self-contained and doesn't depend on any imports.
 */
export function createSignalingMockScript(options: { initialDelay?: number; postInitDelay?: number } = {}): string {
  const { initialDelay = 100, postInitDelay = 200 } = options;

  return `
    (function() {
      if (window.__WS_MOCK_INTERCEPTED__) return;
      window.__WS_MOCK_INTERCEPTED__ = true;

      // Signaling action constants (must match @repo/signaling-types/messages)
      var Actions = {
        START: 'START',
        INI_OFFER: 'initOffer',
        VIDEO_OFFER: 'videoOffer',
        VIDEO_ANSWER: 'videoAnswer',
        NEW_ICE_CANDIDATE: 'newIceCandidate',
        HANG_UP: 'hangUp'
      };

      var waitingPeers = [];
      var connectionIndex = 0;

      function MockWebSocket(url, protocols) {
        this.url = url;
        this.readyState = 0; // CONNECTING
        this.buffer = [];
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;

        var self = this;
        var connId = ++connectionIndex;
        console.log('[WS-MOCK] Connecting to', url, '(peer ' + connId + ')');

        // Simulate connection delay
        setTimeout(function() {
          self.readyState = 1; // OPEN
          console.log('[WS-MOCK] Connection opened for peer', connId);
          if (self.onopen) self.onopen({ type: 'open' });
        }, 50);

        function handleMessage(event) {
          var msg;
          try {
            msg = JSON.parse(typeof event === 'string' ? event : event.data);
          } catch(e) {
            return;
          }

          console.log('[WS-MOCK] Peer', connId, 'sent:', msg.action);

          if (msg.action === Actions.START) {
            waitingPeers.push(self);
            console.log('[WS-MOCK] Peer', connId, 'waiting. Queue size:', waitingPeers.length);

            if (waitingPeers.length >= 2) {
              // Dual-peer mode: match the two peers
              var peer1 = waitingPeers.shift();
              var peer2 = waitingPeers.shift();
              var matchId = 'match-' + Date.now();

              console.log('[WS-MOCK] Matched peer A and peer B:', matchId);

              // Send initOffer to peer 1 (caller)
              setTimeout(function() {
                var initA = JSON.stringify({
                  action: Actions.INI_OFFER,
                  role: 'caller',
                  strangerId: matchId
                });
                if (peer1.onmessage) peer1.onmessage({ data: initA, type: 'message' });
              }, ${initialDelay});

              // Send initOffer to peer 2 (callee)
              setTimeout(function() {
                var initB = JSON.stringify({
                  action: Actions.INI_OFFER,
                  role: 'callee',
                  strangerId: matchId
                });
                if (peer2.onmessage) peer2.onmessage({ data: initB, type: 'message' });

                // Simulate videoOffer exchange after both receive initOffer
                setTimeout(function() {
                  var videoOffer = JSON.stringify({
                    action: Actions.VIDEO_OFFER,
                    senderId: matchId,
                    sdp: { type: 'offer', sdp: 'v=0\\r\\no=- 1234567890 1 IN IP4 127.0.0.1\\r\\ns:-\\r\\nt=0 0\\nm=audio 9 UDP/TLS/SRTP/AES_256_GCM\\r\\na=mid:0\\r\\na=sctp-port:5000\\r\\n' }
                  });
                  if (peer2.onmessage) peer2.onmessage({ data: videoOffer, type: 'message' });

                  setTimeout(function() {
                    var videoAnswer = JSON.stringify({
                      action: Actions.VIDEO_ANSWER,
                      senderId: matchId,
                      sdp: { type: 'answer', sdp: 'v=0\\r\\no=- 9876543210 1 IN IP4 127.0.0.1\\r\\ns:-\\r\\nt=0 0\\nm=audio 9 UDP/TLS/SRTP/AES_256_GCM\\r\\na=mid:0\\r\\na=sctp-port:5000\\r\\n' }
                    });
                    if (peer1.onmessage) peer1.onmessage({ data: videoAnswer, type: 'message' });

                    setTimeout(function() {
                      var iceA = JSON.stringify({
                        action: Actions.NEW_ICE_CANDIDATE,
                        senderId: matchId,
                        candidate: { candidate: 'candidate:1 1 UDP 2122260735 127.0.0.1 55432 typ host', sdpMid: '0', sdpMLineIndex: 0 }
                      });
                      if (peer1.onmessage) peer1.onmessage({ data: iceA, type: 'message' });

                      var iceB = JSON.stringify({
                        action: Actions.NEW_ICE_CANDIDATE,
                        senderId: matchId,
                        candidate: { candidate: 'candidate:2 1 UDP 2122260734 127.0.0.1 55433 typ host', sdpMid: '0', sdpMLineIndex: 0 }
                      });
                      if (peer2.onmessage) peer2.onmessage({ data: iceB, type: 'message' });
                    }, ${postInitDelay});
                  }, ${postInitDelay});
                }, ${postInitDelay});
              }, ${initialDelay});
            } else {
              // Single-peer mode: simulate auto-match for testing
              var lonePeer = waitingPeers[0];
              var soloMatchId = 'solo-' + Date.now();

              console.log('[WS-MOCK] Single peer mode: matching with itself');

              setTimeout(function() {
                var initOffer = JSON.stringify({
                  action: Actions.INI_OFFER,
                  role: 'caller',
                  strangerId: soloMatchId
                });
                if (lonePeer.onmessage) lonePeer.onmessage({ data: initOffer, type: 'message' });

                setTimeout(function() {
                  var videoOffer = JSON.stringify({
                    action: Actions.VIDEO_OFFER,
                    senderId: soloMatchId,
                    sdp: { type: 'offer', sdp: 'v=0\\\\r\\\\no=- 1234567890 1 IN IP4 127.0.0.1\\\\r\\\\ns:-\\\\r\\\\nt=0 0\\\\nm=audio 9 UDP/TLS/SRTP/AES_256_GCM\\\\r\\\\na=mid:0\\\\r\\\\na=sctp-port:5000\\\\r\\\\n' }
                  });
                  if (lonePeer.onmessage) lonePeer.onmessage({ data: videoOffer, type: 'message' });

                  setTimeout(function() {
                    var videoAnswer = JSON.stringify({
                      action: Actions.VIDEO_ANSWER,
                      senderId: soloMatchId,
                      sdp: { type: 'answer', sdp: 'v=0\\\\r\\\\no=- 9876543210 1 IN IP4 127.0.0.1\\\\r\\\\ns:-\\\\r\\\\nt=0 0\\\\nm=audio 9 UDP/TLS/SRTP/AES_256_GCM\\\\r\\\\na=mid:0\\\\r\\\\na=sctp-port:5000\\\\r\\\\n' }
                    });
                    if (lonePeer.onmessage) lonePeer.onmessage({ data: videoAnswer, type: 'message' });

                    setTimeout(function() {
                      var iceCand = JSON.stringify({
                        action: Actions.NEW_ICE_CANDIDATE,
                        senderId: soloMatchId,
                        candidate: { candidate: 'candidate:1 1 UDP 2122260735 127.0.0.1 55432 typ host', sdpMid: '0', sdpMLineIndex: 0 }
                      });
                      if (lonePeer.onmessage) lonePeer.onmessage({ data: iceCand, type: 'message' });
                    }, ${postInitDelay});
                  }, ${postInitDelay});
                }, ${postInitDelay});
              }, ${initialDelay});
            }
          } else if (msg.action === Actions.HANG_UP) {
            var hangUp = JSON.stringify({
              action: Actions.HANG_UP,
              strangerId: msg.strangerId
            });
            if (self.onmessage) self.onmessage({ data: hangUp, type: 'message' });
          }
        }

        this.send = function(data) {
          handleMessage(data);
        };
      }

      MockWebSocket.CONNECTING = 0;
      MockWebSocket.OPEN = 1;
      MockWebSocket.CLOSING = 2;
      MockWebSocket.CLOSED = 3;

      MockWebSocket.prototype.close = function() {
        this.readyState = MockWebSocket.CLOSED;
        if (this.onclose) this.onclose({ type: 'close', code: 1000, reason: '' });
        var idx = waitingPeers.indexOf(this);
        if (idx > -1) waitingPeers.splice(idx, 1);
      };

      window.WebSocket = MockWebSocket;
      console.log('[WS-MOCK] WebSocket intercepted');
    })();
  `;
}

/**
 * Default signaling mock script for single-peer mode.
 */
export const defaultSignalingMockScript = createSignalingMockScript({ 
  initialDelay: 50, 
  postInitDelay: 100 
});