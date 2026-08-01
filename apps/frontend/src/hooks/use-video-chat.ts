import { useCallback, useEffect, useRef, useState } from 'react';
import useWebSocketModule, { ReadyState } from 'react-use-websocket';

const { default: useWebSocket = useWebSocketModule } =
  useWebSocketModule as unknown as {
    default: typeof useWebSocketModule;
  };

import { ChatSession, generateUserId } from '@repo/chat';
import {
  defaultMediaConstraints,
  PeerConnectionEngine,
  type PeerConnectionFactory
} from '@repo/webrtc';
import { toast } from '../components/ui/toast';
import config from '../config.ts';
import { makeReactWSSignaler } from '../lib/signaler-adapter.ts';

export interface ChatMessage {
  content: string;
  senderId: string;
  timestamp: number;
}

const browserFactory: PeerConnectionFactory = {
  create(config: RTCConfiguration): RTCPeerConnection {
    return new RTCPeerConnection(config);
  }
};

type Stage = 'idle' | 'searching' | 'connected';

export function useVideoChat() {
  const localCam = useRef<HTMLVideoElement>(null);
  const strangerCam = useRef<HTMLVideoElement | null>(null);

  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [userId, setUserId] = useState(() => generateUserId());
  const [strangerId, setStrangerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const sessionRef = useRef<ChatSession | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const { sendMessage, lastMessage, readyState } = useWebSocket(
    config.signalingServer.URL,
    {
      share: false
    }
  );

  const onRemoteTrack = useCallback((stream: MediaStream) => {
    if (strangerCam.current && !strangerCam.current.srcObject) {
      strangerCam.current.srcObject = stream;
      setStage('connected');
    }
  }, []);

  const onStrangerIdChange = useCallback((strangerId: string | null) => {
    setStrangerId(strangerId);
  }, []);

  const onClose = useCallback(
    (reason?: 'replacing' | 'stopping' | 'timeout') => {
      if (strangerCam.current) {
        strangerCam.current.srcObject = null;
        strangerCam.current.src = '';
      }

      setMessages([]);

      if (reason === 'stopping' || reason === 'timeout') {
        setStage('idle');
        return;
      }

      sessionRef.current?.start();
      setStage('searching');
    },
    []
  );

  const onError = useCallback((err: Error) => {
    toast.add({
      title: 'Call error',
      description: err.message,
      type: 'error',
      timeout: 5000
    });
  }, []);

  const handleChatMessage = useCallback((content: string, senderId: string) => {
    setMessages(prev => [
      ...prev,
      { content, senderId, timestamp: Date.now() }
    ]);
  }, []);

  const onStart = useCallback(() => {
    sessionRef.current?.start();
    setStage('searching');
  }, []);

  const onNext = useCallback(() => {
    if (strangerCam.current) {
      strangerCam.current.srcObject = null;
      strangerCam.current.src = '';
    }

    sessionRef.current?.hangUp();
  }, []);

  const onStop = useCallback(() => {
    sessionRef.current?.hangUp('stopping');
  }, []);

  const sendChatMessageFn = useCallback((content: string) => {
    sessionRef.current?.sendChatMessage(content);
  }, []);

  useEffect(() => {
    switch (readyState) {
      case ReadyState.OPEN: {
        const signaler = makeReactWSSignaler(sendMessage);

        sessionRef.current?.dispose();

        const engine = new PeerConnectionEngine(browserFactory, signaler, {
          onRemoteTrack,
          onClose,
          onError,
          onStrangerIdChange
        });
        const session = new ChatSession(signaler, engine, {
          onChatMessage: handleChatMessage
        });
        sessionRef.current = session;
        setUserId(session.userId);

        if (webcamStreamRef.current) {
          void engine.setLocalStream(webcamStreamRef.current);
        }

        setIsWebSocketConnected(true);
        break;
      }
      case ReadyState.CLOSED:
        sessionRef.current?.dispose();
        sessionRef.current = null;
        setIsWebSocketConnected(false);
        break;
    }
  }, [
    readyState,
    sendMessage,
    onRemoteTrack,
    onClose,
    onError,
    handleChatMessage
  ]);

  useEffect(() => {
    const getUserMedia = async () => {
      if (!localCam.current) return;

      try {
        const webcamStream = await navigator.mediaDevices.getUserMedia(
          defaultMediaConstraints
        );
        localCam.current.srcObject = webcamStream;
        webcamStreamRef.current = webcamStream;
        void sessionRef.current?.setLocalStream(webcamStream);
      } catch (_err) {
        return;
      }
    };

    void getUserMedia();
  }, []);

  useEffect(() => {
    const message = JSON.parse(lastMessage?.data ?? '{"action": "none"}');

    if (!lastMessage || !sessionRef.current) return;

    void sessionRef.current.handleIncomingMessage(message);
  }, [lastMessage]);

  useEffect(() => {
    return () => {
      sessionRef.current?.dispose();
    };
  }, []);

  return {
    localCam,
    strangerCam,
    isWebSocketConnected,
    stage,
    userId,
    strangerId,
    messages,
    actions: {
      onStart,
      onNext,
      onStop
    },
    sendChatMessage: sendChatMessageFn
  };
}
