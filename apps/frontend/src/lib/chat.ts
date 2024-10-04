import {
  Actions,
  HangUpMessage,
  Message,
  NewIceCandidateMessage,
  ReceivedMessage,
  StartMessage,
  VideoAnswerInputMessage,
  VideoAnswerOutputMessage,
  VideoOfferInputMessage,
  VideoOfferOutputMessage,
} from '@repo/signaling-types/messages';

let myPeerConnection: RTCPeerConnection | null = null; // RTCPeerConnection
let webcamStream: MediaStream | null = null; // MediaStream from webcam
let strangerId: string | null = null;

let onTrackCallback: (event: RTCTrackEvent) => void;
let onCloseVideoCallback: () => void;
let signaler: ISignaler;
let role: 'caller' | 'callee';

let remoteIceCandidates: RTCIceCandidate[] = [];
let hasRemoteDescription = false;

export function setWebcamStream(stream: MediaStream) {
  webcamStream = stream;
}

interface ISignaler {
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
}

export const setSignaler = (mySignaler: ISignaler) => (signaler = mySignaler);

export function sendToServer(msg: Message) {
  const msgJSON = JSON.stringify(msg);
  signaler.send(msgJSON);
}

export function setOnTrackCallBack(callback: (event: RTCTrackEvent) => void) {
  onTrackCallback = callback;
}

export function setOnCloseVideoCallback(callback: () => void) {
  onCloseVideoCallback = callback;
}

async function createPeerConnection() {
  myPeerConnection = new RTCPeerConnection({
    // add your own TURN server here
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });

  myPeerConnection.onicecandidate = handleICECandidateEvent;
  myPeerConnection.oniceconnectionstatechange =
    handleICEConnectionStateChangeEvent;
  myPeerConnection.onicegatheringstatechange =
    handleICEGatheringStateChangeEvent;
  myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
  myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;
  myPeerConnection.ontrack = handleTrackEvent;
}

export async function handleIncomingMessage(msg: ReceivedMessage) {
  console.log('<-- Received : ' + msg.action);

  switch (msg.action) {
    case Actions.INI_OFFER:
      role = msg.role;
      if (msg.role === 'caller') {
        strangerId = msg.strangerId;
        await invite();
      }
      break;

    case Actions.VIDEO_OFFER:
      await handleVideoOfferMsg(msg);
      break;

    case Actions.VIDEO_ANSWER: // Callee has answered our offer
      await handleVideoAnswerMsg(msg);
      break;

    case Actions.NEW_ICE_CANDIDATE: // A new ICE candidate has been received
      await handleNewICECandidateMsg(msg);
      break;

    case Actions.HANG_UP: // The other peer has hung up the call
      handleHangUpMsg();
      break;

    default:
    // nothing to do.
  }
}

async function handleNegotiationNeededEvent() {
  if (!myPeerConnection || !strangerId || role === 'callee') return;

  try {
    const offer = await myPeerConnection.createOffer();

    if (myPeerConnection.signalingState != 'stable') {
      return;
    }

    // trigger onicecandidate event
    await myPeerConnection.setLocalDescription(offer);

    // Send the offer to the remote peer.
    console.log('---> SEND VIDEO OFFER to ' + strangerId);
    const videoOfferMessage: VideoOfferOutputMessage = {
      action: Actions.VIDEO_OFFER,
      sdp: myPeerConnection.localDescription as RTCSessionDescription,
      strangerId,
    };
    sendToServer(videoOfferMessage);
  } catch (err) {
    console.log(
      '*** The following error occurred while handling the negotiationneeded event:',
    );
    console.error(err);
  }
}

function handleTrackEvent(event: RTCTrackEvent) {
  onTrackCallback(event);
}

// Trigger: handleNegotiationNeededEvent -> setLocalDescription
function handleICECandidateEvent(event: RTCPeerConnectionIceEvent) {
  if (event.candidate && strangerId) {
    const newIceCandidateMessage: NewIceCandidateMessage = {
      action: Actions.NEW_ICE_CANDIDATE,
      strangerId,
      candidate: event.candidate,
    };
    sendToServer(newIceCandidateMessage);
  }
}

// Receive new ICE candidates from the other peer
async function handleNewICECandidateMsg(msg: NewIceCandidateMessage) {
  // We don't have received Video Offer (where we set remote description), so we need to queue the ICE candidates.
  if (!myPeerConnection || !hasRemoteDescription) {
    remoteIceCandidates.push(msg.candidate);
    return;
  }

  const candidate = new RTCIceCandidate(msg.candidate);

  try {
    await myPeerConnection.addIceCandidate(candidate);
  } catch (err) {
    console.error(err);
  }
}

function handleICEConnectionStateChangeEvent() {
  if (!myPeerConnection) return;

  switch (myPeerConnection.iceConnectionState) {
    case 'closed':
    case 'failed':
    case 'disconnected':
      closeVideoCall();
      break;
  }
}

function handleSignalingStateChangeEvent() {
  if (!myPeerConnection) return;

  switch (myPeerConnection.signalingState) {
    case 'closed':
      closeVideoCall();
      break;
    case 'have-remote-offer':
      break;
  }
}

function handleICEGatheringStateChangeEvent() {
  //log("*** ICE gathering state changed to: " + myPeerConnection.iceGatheringState);
}

export function startChat() {
  const startMessage: StartMessage = {
    action: Actions.START,
  };
  sendToServer(startMessage);
}

async function invite() {
  console.log('INVITE');
  if (!webcamStream) return;

  if (myPeerConnection) {
    alert("You can't start a call because you already have one open!");
  } else {
    await createPeerConnection();

    try {
      webcamStream
        .getTracks()
        .forEach((track) =>
          myPeerConnection?.addTrack(track, webcamStream as MediaStream),
        );
      // => handleNegotiationNeededEvent will be triggered
    } catch (err) {
      handleGetUserMediaError(err as Error);
    }
  }
}

async function handleVideoOfferMsg(msg: VideoOfferInputMessage) {
  strangerId = msg.senderId;

  console.log('RECEIVE VIDEO OFFER from ' + strangerId);
  if (!myPeerConnection) {
    await createPeerConnection();
  }
  if (!myPeerConnection) return;

  const desc = new RTCSessionDescription(msg.sdp);

  if (myPeerConnection.signalingState != 'stable') {
    // Set the local and remove descriptions for rollback; don't proceed
    // until both return.
    await Promise.all([
      myPeerConnection.setLocalDescription({ type: 'rollback' }),
      myPeerConnection.setRemoteDescription(desc),
    ]);
    return;
  } else {
    await myPeerConnection.setRemoteDescription(desc);
  }

  hasRemoteDescription = true;

  // drain candidate
  const size = remoteIceCandidates.length;

  if (size > 0) {
    for (const candidate of remoteIceCandidates) {
      await myPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }

    remoteIceCandidates = [];
    console.log(`${size} received remote ICE candidates added to local peer`);
  }

  if (!webcamStream) return;

  webcamStream
    .getTracks()
    .forEach((track) =>
      myPeerConnection?.addTrack(track, webcamStream as MediaStream),
    );

  await myPeerConnection.setLocalDescription(
    await myPeerConnection.createAnswer(),
  );

  console.log('---> SEND VIDEO ANSWER to ' + strangerId);
  const videoAnswerMessage: VideoAnswerOutputMessage = {
    action: Actions.VIDEO_ANSWER,
    senderId: strangerId,
    sdp: myPeerConnection?.localDescription as RTCSessionDescription,
  };
  sendToServer(videoAnswerMessage);
}

async function handleVideoAnswerMsg(msg: VideoAnswerInputMessage) {
  if (!myPeerConnection) return;

  console.log('RECEIVE VIDEO ANSWER');
  const desc = new RTCSessionDescription(msg.sdp);
  await myPeerConnection.setRemoteDescription(desc).catch(console.error);
  hasRemoteDescription = true;
}

export function handleGetUserMediaError(e: Error) {
  console.error(e);
  switch (e.name) {
    case 'NotFoundError':
      alert(
        'Unable to open your call because no camera and/or microphone' +
          'were found.',
      );
      break;
    case 'SecurityError':
    case 'PermissionDeniedError':
      // Do nothing; this is the same as the user canceling the call.
      break;
    default:
      alert('Error opening your camera and/or microphone: ' + e.message);
      break;
  }

  closeVideoCall();
}

function handleHangUpMsg() {
  closeVideoCall();
}

export function hangUpCall() {
  closeVideoCall();

  const hangUpMessage: HangUpMessage = {
    action: Actions.HANG_UP,
    strangerId: strangerId as string,
  };
  sendToServer(hangUpMessage);
}

function closeVideoCall() {
  console.log('Closing the call');

  if (myPeerConnection) {
    console.log('--> Closing the peer connection');

    myPeerConnection.ontrack = null;
    myPeerConnection.onicecandidate = null;
    myPeerConnection.oniceconnectionstatechange = null;
    myPeerConnection.onsignalingstatechange = null;
    myPeerConnection.onicegatheringstatechange = null;
    myPeerConnection.onnegotiationneeded = null;

    // Stop all transceivers on the connection

    myPeerConnection.getTransceivers().forEach((transceiver) => {
      transceiver.stop();
    });

    // Close the peer connection

    myPeerConnection.close();
    myPeerConnection = null;
    webcamStream = null;
    hasRemoteDescription = false;
    remoteIceCandidates = [];

    onCloseVideoCallback();
  }

  strangerId = null;
}
