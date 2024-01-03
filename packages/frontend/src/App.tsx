import { useEffect, useRef, useState } from 'react';
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
  setWs
} from './webRTC.ts';
import config from './config.ts';
import { Actions } from './types/messages.ts';


// The media constraints object describes what sort of stream we want
// to request from the local A/V hardware (typically a webcam and
// microphone). Here, we specify only that we want both audio and
// video; however, you can be more specific. It's possible to state
// that you would prefer (or require) specific resolutions of video,
// whether to prefer the user-facing or rear-facing camera (if available),
// and so on.
//
// See also:
// https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamConstraints
// https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
//
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
  const localCam = useRef<HTMLVideoElement | null>(null);
  const strangerCam = useRef<HTMLVideoElement | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isChatOn, setIsChatOn] = useState(false);

  const onCloseVideo = () => {
    if (strangerCam.current) {
      strangerCam.current.srcObject = null;
      strangerCam.current.src = '';
    }
    setIsChatOn(false);
  };

  const onTrack = (event: RTCTrackEvent) => {
    if (strangerCam.current) {
      strangerCam.current.srcObject = event.streams[0];
      setIsChatOn(true);
    }
  };

  const sendInvitation = async () => {
    await invite((localCam.current as HTMLVideoElement).srcObject as MediaStream);
  };

  const connect = async () => {
    const myStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    (localCam.current as HTMLVideoElement).srcObject = myStream;

    ws.current = new WebSocket(config.signalingServer.URL, ['json']);
    setWs(ws.current);
    setOnTrackCallBack(onTrack);
    setOnCloseVideoCallback(onCloseVideo);

    ws.current.onopen = (event) => {
      console.log('WebSocket Client Connected', event);
      setIsConnected(true);
    };

    ws.current.onclose = () => {
      setIsConnected(false);
    }

    ws.current.onerror = function (evt) {
      console.dir(evt);
    };

    ws.current.onmessage = async function (evt) {
      const msg = JSON.parse(evt.data);
      console.log('Message received: ');
      console.dir(msg);

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
          handleNewICECandidateMsg(msg);
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
      <button onClick={connect}  disabled={isConnected}>Connect</button>
      <button onClick={sendInvitation} disabled={!isConnected || isChatOn}>Start</button>
      <button onClick={hangUpCall} disabled={!isChatOn}>Hang up</button>
      <div className="camerabox">
        <video style={{border: '3px solid blue', marginRight: '10px'}} ref={strangerCam} autoPlay></video>
        <video style={{border: '3px solid green'}} ref={localCam} autoPlay></video>
      </div>
    </>
  );
}

export default App;
