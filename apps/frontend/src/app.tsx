import useWebSocket, { ReadyState } from 'react-use-websocket';
import config from './config';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  handleGetUserMediaError,
  handleIncomingMessage,
  hangUpCall,
  setOnCloseVideoCallback,
  setOnTrackCallBack,
  setSignaler,
  setWebcamStream,
  startChat,
} from './lib/chat.ts';

const mediaConstraints = {
  audio: true, // We want an audio track
  video: {
    aspectRatio: {
      ideal: 1.333333, // 3:2 aspect is preferred
    },
  },
};

export default function App() {
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

  return (
    <>
      <div className="grid grid-cols-2">
        <div>
          <video
            className="w-full h-full border-blue-500 border-4"
            ref={strangerCam}
            autoPlay
          ></video>
        </div>
        <div>
          <video
            className="w-full h-full border-blue-500 border-4"
            ref={localCam}
            autoPlay
          />
        </div>
      </div>

      <div className="grid grid-cols-2 h-10">
        <div className="bg-white">
          <div>{isConnected ? 'Connected' : 'Not connected'}</div>
          {isChatOn ? (
            <button
              className="disabled:bg-gray-500 text-xl py-8 px-10 m-2 bg-pink-400 text-white rounded-xl"
              onClick={next}
              disabled={!isConnected}
            >
              Next
            </button>
          ) : (
            <button
              className="disabled:bg-gray-500 text-xl py-8 px-10 m-2 bg-pink-400 text-black rounded-xl"
              onClick={startChat}
              disabled={!isConnected}
            >
              Start
            </button>
          )}
          <button
            className="disabled:bg-gray-400 text-xl py-8 px-10 m-2 bg-fuchsia-700 text-white rounded-xl"
            onClick={stop}
            disabled={!isChatOn}
          >
            Stop
          </button>
        </div>
        <div className="bg-gray-800 flex flex-col flex-1"></div>
      </div>
    </>
  );
}
