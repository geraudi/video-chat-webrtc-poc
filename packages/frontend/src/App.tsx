import { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';

import './App.css';
import {
  closeVideoCall,
  handleNewICECandidateMsg,
  handleVideoAnswerMsg,
  handleVideoOfferMsg,
  hangUpCall,
  invite,
  setOnCloseVideoCallback,
  setOnTrackCallBack,
  setSignaler
} from './lib/peerConnection.ts';
import config from './config.ts';
import { Actions } from '../../core/src/types/messages.ts';

const mediaConstraints = {
  audio: true,            // We want an audio track
  video: {
    aspectRatio: {
      ideal: 1.333333     // 3:2 aspect is preferred
    }
  }
};

function App () {
  const ws = useRef<WebSocket>();
  const findNext = useRef<boolean>();
  const localCam = useRef<Webcam>(null);
  const strangerCam = useRef<HTMLVideoElement | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isChatOn, setIsChatOn] = useState(false);

  const stop = () => {
    findNext.current = false;
    hangUpCall();
  }

  const onCloseVideo = () => {
    if (strangerCam.current) {
      strangerCam.current.srcObject = null;
      strangerCam.current.src = '';
    }
    setIsChatOn(false);
    if (findNext.current === true) {
      sendInvitation()
    }
  };

  const onTrack = (event: RTCTrackEvent) => {
    if (strangerCam.current) {
      strangerCam.current.srcObject = event.streams[0];
      setIsChatOn(true);
    }
  };

  const sendInvitation = async () => {
    findNext.current = true;
    await invite((localCam.current as unknown as HTMLVideoElement).srcObject as MediaStream);
  };

  const connect = async () => {
    const myStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    (localCam.current as unknown as HTMLVideoElement).srcObject = myStream;

    ws.current = new WebSocket(config.signalingServer.URL, ['json']);
    setSignaler(ws.current);
    setOnTrackCallBack(onTrack);
    setOnCloseVideoCallback(onCloseVideo);

    ws.current.onopen = (event) => {
      console.log('WebSocket Client Connected', event);
      setIsConnected(true);
    };

    ws.current.onclose = () => {
      setIsConnected(false);
    };

    ws.current.onerror = function (evt) {
      console.dir(evt);
    };

    ws.current.onmessage = async function (evt) {
      const msg = JSON.parse(evt.data);
      console.log(`<-- Message received: ${msg.action}`);

      switch (msg.action) {
        // Signaling messages: these messages are used to trade WebRTC
        // signaling information during negotiations leading up to a video
        // call.

        case Actions.VIDEO_OFFER:  // Receive the offert to chat
          await handleVideoOfferMsg(msg, myStream);
          break;

        case Actions.VIDEO_ANSWER:  // Callee has answered our offer
          handleVideoAnswerMsg(msg);
          break;

        case Actions.NEW_ICE_CANDIDATE: // A new ICE candidate has been received
          await handleNewICECandidateMsg(msg);
          break;

        case Actions.HANG_UP: // The other peer has hung up the call
          closeVideoCall();
          break;
      }
    };
  };

  useEffect(() => {
    //clean up function
    return () => ws.current?.close();
  }, []);

  return (
    <>
      <h1>Chat with stranger</h1>
      <button onClick={connect} disabled={isConnected}>Connect</button>
      {isChatOn ? (
        <button onClick={hangUpCall} disabled={!isConnected}>Next</button>
      ) : (
        <button onClick={sendInvitation} disabled={!isConnected}>Start</button>
      )}
      <button onClick={stop} disabled={!isChatOn}>Stop</button>
      <div className="camerabox">
        <video style={{border: '3px solid blue', marginRight: '10px'}} ref={strangerCam} autoPlay></video>
        <Webcam audio ref={localCam}/>
      </div>
    </>
  );
}

export default App;
