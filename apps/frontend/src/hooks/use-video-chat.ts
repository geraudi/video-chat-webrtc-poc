import { useCallback, useEffect, useRef, useState } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import config from '../config.ts';
import {
  handleGetUserMediaError,
  handleIncomingMessage,
  hangUpCall,
  setOnCloseVideoCallback,
  setOnTrackCallBack,
  setSignaler,
  setWebcamStream,
  startChat,
} from '../lib/chat.ts';

const mediaConstraints = {
  audio: true,
  video: {
    aspectRatio: {
      ideal: 1.333333,
    },
  },
};

export function useVideoChat() {
  const findNext = useRef<boolean>(false);
  const localCam = useRef<HTMLVideoElement>(null);
  const strangerCam = useRef<HTMLVideoElement | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isChatOn, setIsChatOn] = useState(false);

  const { sendMessage, lastMessage, readyState } = useWebSocket(
    config.signalingServer.URL,
    {
      share: false,
    },
  );

  const onTrack = (event: RTCTrackEvent) => {
    event.track.onunmute = () => {
      if (strangerCam.current?.srcObject) {
        return;
      }
      if (strangerCam.current) {
        strangerCam.current.srcObject = event.streams[0];
        setIsChatOn(true);
      }
    };
  };

  const stop = () => {
    findNext.current = false;
    hangUpCall();
  };

  const next = () => {
    findNext.current = true;
    hangUpCall();
  };

  const onCloseVideo = useCallback(() => {
    if (strangerCam.current) {
      strangerCam.current.srcObject = null;
      strangerCam.current.src = '';
    }
    setIsChatOn(false);
    if (findNext.current) {
      startChat();
    }
  }, [strangerCam]);

  // Initialize websocket connection
  useEffect(() => {
    switch (readyState) {
      case ReadyState.OPEN:
        setSignaler({ send: sendMessage });
        setOnTrackCallBack(onTrack);
        setOnCloseVideoCallback(onCloseVideo);
        setIsConnected(true);
        break;
      case ReadyState.CLOSED:
        setIsConnected(false);
        break;
    }
  }, [onCloseVideo, readyState, sendMessage]);

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
  }, [localCam]);

  // Handle receive message from websocket
  useEffect(() => {
    const message = JSON.parse(lastMessage?.data ?? '{"action": "none"}');

    if (!lastMessage || !localCam.current) return;

    void handleIncomingMessage(message);
  }, [lastMessage]);

  return {
    localCam,
    strangerCam,
    isConnected,
    isChatOn,
    actions: {
      start: startChat,
      stop,
      next,
    },
  };
}
