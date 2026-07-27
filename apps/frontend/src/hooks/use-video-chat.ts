import { useCallback, useEffect, useRef, useState } from 'react';
import useWebSocketModule, { ReadyState } from 'react-use-websocket';

const { default: useWebSocket = useWebSocketModule } =
  useWebSocketModule as unknown as {
    default: typeof useWebSocketModule;
  };

import config from '../config.ts';
import {
  generateUserId,
  getStrangerId,
  getUserId,
  handleGetUserMediaError,
  handleIncomingMessage,
  hangUpCall,
  setOnCloseVideoCallback,
  setOnTrackCallBack,
  setSignaler,
  setWebcamStream,
  startChat
} from '../lib/chat.ts';

const mediaConstraints = {
  audio: true,
  video: {
    aspectRatio: {
      ideal: 1.333333
    }
  }
};

/**
 * Single source of truth for the UI state machine.
 *
 * Stage transitions:
 * - idle → searching (onStart)
 * - searching → connected (peer video received)
 * - connected → searching (onNext / re-matching)
 * - connected → idle (onStop / hangup)
 * - searching → idle (optional, if connection fails before match)
 */
type Stage = 'idle' | 'searching' | 'connected';

export function useVideoChat() {
  const localCam = useRef<HTMLVideoElement>(null);
  const strangerCam = useRef<HTMLVideoElement | null>(null);

  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  // Single source of truth for button state
  const [stage, setStage] = useState<Stage>('idle');
  const [userId] = useState(() => generateUserId());
  const [strangerId, setStrangerId] = useState<string | null>(null);

  const { sendMessage, lastMessage, readyState } = useWebSocket(
    config.signalingServer.URL,
    {
      share: false
    }
  );

  // Callback when a peer's video track is received
  const onTrack = (event: RTCTrackEvent) => {
    event.track.onunmute = () => {
      if (strangerCam.current?.srcObject) {
        return;
      }
      if (strangerCam.current) {
        strangerCam.current.srcObject = event.streams[0];
        // Chat connected → transition to connected stage
        setStage('connected');
      }
    };
    // Also set the stream immediately for headless testing (onunmute may not fire in mocks)
    if (strangerCam.current && !strangerCam.current.srcObject) {
      strangerCam.current.srcObject = event.streams[0];
      // Chat connected → transition to connected stage
      setStage('connected');
    }
  };

  // Callback when video call ends (peer disconnected or hangup)
  const onCloseVideo = useCallback((reason?: 'replacing' | 'stopping') => {
    if (strangerCam.current) {
      strangerCam.current.srcObject = null;
      strangerCam.current.src = '';
    }

    // User explicitly stopped → return to idle, do NOT auto-reconnect.
    if (reason === 'stopping') {
      setStage('idle');
      return;
    }

    // Call ended → peer disconnected, transition to searching for new peer
    startChat();
    setStage('searching');
  }, []);

  // Start button clicked: make this peer available for matching
  const onStart = useCallback(() => {
    startChat();
    setStage('searching');
  }, []);

  // Next button clicked: hang up current chat and immediately search for a new peer
  const onNext = useCallback(() => {
    // Disconnect from current chat first
    if (strangerCam.current) {
      strangerCam.current.srcObject = null;
      strangerCam.current.src = '';
    }

    // Hang up via signaling (will trigger onCloseVideo → startChat for auto-reconnect)
    hangUpCall();
  }, []);

  // Stop button clicked: disconnect the current call and return to idle.
  // Passing 'stopping' so onCloseVideo returns to idle instead of re-searching.
  const onStop = useCallback(() => {
    hangUpCall('stopping');
  }, []);

  // Initialize websocket connection
  useEffect(() => {
    switch (readyState) {
      case ReadyState.OPEN:
        setSignaler({ send: sendMessage });
        setOnTrackCallBack(onTrack);
        setOnCloseVideoCallback(onCloseVideo);
        setIsWebSocketConnected(true);
        break;
      case ReadyState.CLOSED:
        setIsWebSocketConnected(false);
        break;
    }
  }, [onCloseVideo, readyState, sendMessage, onTrack]);

  // Initialize webcam
  useEffect(() => {
    const getUserMedia = async () => {
      if (!localCam.current) return;

      try {
        const webcamStream =
          await navigator.mediaDevices.getUserMedia(mediaConstraints);
        localCam.current.srcObject = webcamStream;
        setWebcamStream(webcamStream);
      } catch (err) {
        handleGetUserMediaError(err as Error);
        return;
      }
    };

    void getUserMedia();
  }, []);

  // Update strangerId when it changes (from chat module)
  useEffect(() => {
    setStrangerId(getStrangerId());
  }, [stage]);

  // Handle receive message from websocket
  useEffect(() => {
    const message = JSON.parse(lastMessage?.data ?? '{"action": "none"}');

    if (!lastMessage || !localCam.current) return;

    void handleIncomingMessage(message);
  }, [lastMessage]);

  return {
    localCam,
    strangerCam,
    isWebSocketConnected,
    stage,
    userId,
    strangerId: strangerId ?? getUserId(),
    // Actions
    actions: {
      onStart,
      onNext,
      onStop
    }
  };
}
