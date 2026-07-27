import {
  Actions,
  type HangUpMessage,
  type Message,
  type NewIceCandidateMessage,
  type ReceivedMessage,
  type StartMessage,
  type VideoAnswerInputMessage,
  type VideoAnswerOutputMessage,
  type VideoOfferInputMessage,
  type VideoOfferOutputMessage
} from '@repo/signaling-types/messages';

let myPeerConnection: RTCPeerConnection | null = null; // RTCPeerConnection
let webcamStream: MediaStream | null = null; // MediaStream from webcam
let strangerId: string | null = null;
let userId: string | null = null;

/**
 * Generate a unique user ID for debugging purposes
 */
export function generateUserId(): string {
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
  return userId;
}

export function getUserId(): string | null {
  return userId;
}

export function getStrangerId(): string | null {
  return strangerId;
}

let onTrackCallback: (event: RTCTrackEvent) => void;
let onCloseVideoCallback: () => void;
let signaler: ISignaler;
let role: 'caller' | 'callee';

let remoteIceCandidates: RTCIceCandidate[] = [];
let hasRemoteDescription = false;

// Pending match: when a match arrives before the local webcam stream is ready
// (getUserMedia still resolving), we record it here and resume once the stream
// is set via setWebcamStream. This replaces the old silent `if (!webcamStream) return`.
let pendingCallerMatch: boolean = false;
let pendingVideoOffer: VideoOfferInputMessage | null = null;

export function setWebcamStream(stream: MediaStream) {
  webcamStream = stream;

  // If a match was waiting for the stream, resume it now.
  if (pendingCallerMatch) {
    pendingCallerMatch = false;
    void invite();
  }
  if (pendingVideoOffer) {
    const offer = pendingVideoOffer;
    pendingVideoOffer = null;
    void handleVideoOfferMsg(offer);
  }
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
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  myPeerConnection.onicecandidate = handleICECandidateEvent;
  myPeerConnection.oniceconnectionstatechange =
    handleICEConnectionStateChangeEvent;
  myPeerConnection.onicegatheringstatechange =
    handleICEGatheringStateChangeEvent;
  myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
  myPeerConnection.onconnectionstatechange = handleConnectionStateChangeEvent;
  myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;
  myPeerConnection.ontrack = handleTrackEvent;
}

export async function handleIncomingMessage(msg: ReceivedMessage) {
  console.log(`<-- Received : ${msg.action}`);

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

    if (myPeerConnection.signalingState !== 'stable') {
      return;
    }

    // trigger onicecandidate event
    await myPeerConnection.setLocalDescription(offer);

    // Send the offer to the remote peer.
    console.log(`---> SEND VIDEO OFFER to ${strangerId}`);
    const videoOfferMessage: VideoOfferOutputMessage = {
      action: Actions.VIDEO_OFFER,
      sdp: myPeerConnection.localDescription as RTCSessionDescription,
      strangerId
    };
    sendToServer(videoOfferMessage);
  } catch (err) {
    console.log(
      '*** The following error occurred while handling the negotiationneeded event:'
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
    console.log(`---> SEND ICE CANDIDATE to ${strangerId}`);
    const newIceCandidateMessage: NewIceCandidateMessage = {
      action: Actions.NEW_ICE_CANDIDATE,
      strangerId,
      candidate: event.candidate
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

  console.log(
    `[pc] iceConnectionState=${myPeerConnection.iceConnectionState} role=${role} stranger=${strangerId}`
  );

  switch (myPeerConnection.iceConnectionState) {
    case 'closed':
    case 'failed':
      closeVideoCall();
      break;
  }
}

function handleSignalingStateChangeEvent() {
  if (!myPeerConnection) return;

  console.log(
    `[pc] signalingState=${myPeerConnection.signalingState} role=${role} stranger=${strangerId}`
  );

  switch (myPeerConnection.signalingState) {
    case 'closed':
      closeVideoCall();
      break;
    case 'have-remote-offer':
      break;
  }
}

function handleICEGatheringStateChangeEvent() {
  if (!myPeerConnection) return;
  console.log(
    `[pc] iceGatheringState=${myPeerConnection.iceGatheringState} role=${role} stranger=${strangerId}`
  );
}

function handleConnectionStateChangeEvent() {
  if (!myPeerConnection) return;
  console.log(
    `[pc] connectionState=${myPeerConnection.connectionState} role=${role} stranger=${strangerId}`
  );
}

export function startChat() {
  console.log('---> SEND START (looking for stranger)');
  const startMessage: StartMessage = {
    action: Actions.START
  };
  sendToServer(startMessage);
}

async function invite() {
  console.log('INVITE');

  // If the webcam stream isn't ready yet (getUserMedia still resolving),
  // defer until setWebcamStream() flushes the pending match.
  if (!webcamStream) {
    console.log('INVITE deferred: webcam stream not ready yet');
    pendingCallerMatch = true;
    return;
  }

  if (myPeerConnection) {
    alert("You can't start a call because you already have one open!");
  } else {
    await createPeerConnection();

    try {
      webcamStream
        .getTracks()
        .forEach(track =>
          myPeerConnection?.addTrack(track, webcamStream as MediaStream)
        );
      // => handleNegotiationNeededEvent will be triggered
    } catch (err) {
      handleGetUserMediaError(err as Error);
    }
  }
}

async function handleVideoOfferMsg(msg: VideoOfferInputMessage) {
  strangerId = msg.senderId;

  console.log(`RECEIVE VIDEO OFFER from ${strangerId}`);

  // If the webcam stream isn't ready yet (getUserMedia still resolving), defer
  // the whole offer handling until setWebcamStream() flushes the pending offer.
  if (!webcamStream) {
    console.log('VIDEO OFFER deferred: webcam stream not ready yet');
    pendingVideoOffer = msg;
    return;
  }

  if (!myPeerConnection) {
    await createPeerConnection();
  }
  if (!myPeerConnection) return;

  const desc = new RTCSessionDescription(msg.sdp);

  // The callee never initiates an offer, so simultaneous-offer (glare) cannot
  // happen here. Accept the remote offer directly.
  await myPeerConnection.setRemoteDescription(desc);

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

  webcamStream
    .getTracks()
    .forEach(track =>
      myPeerConnection?.addTrack(track, webcamStream as MediaStream)
    );

  await myPeerConnection.setLocalDescription(
    await myPeerConnection.createAnswer()
  );

  console.log(`---> SEND VIDEO ANSWER to ${strangerId}`);
  const videoAnswerMessage: VideoAnswerOutputMessage = {
    action: Actions.VIDEO_ANSWER,
    strangerId,
    sdp: myPeerConnection?.localDescription as RTCSessionDescription
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
          'were found.'
      );
      break;
    case 'SecurityError':
    case 'PermissionDeniedError':
      // Do nothing; this is the same as the user canceling the call.
      break;
    default:
      alert(`Error opening your camera and/or microphone: ${e.message}`);
      break;
  }

  closeVideoCall();
}

function handleHangUpMsg() {
  closeVideoCall();
}

export function hangUpCall() {
  // Capture strangerId BEFORE closeVideoCall() resets it to null
  const currentStrangerId = strangerId;

  console.log(`---> SEND HANG_UP to ${currentStrangerId}`);
  const hangUpMessage: HangUpMessage = {
    action: Actions.HANG_UP,
    strangerId: currentStrangerId as string
  };
  sendToServer(hangUpMessage);

  closeVideoCall();
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
    myPeerConnection.onconnectionstatechange = null;
    myPeerConnection.onnegotiationneeded = null;

    // Stop all transceivers on the connection

    myPeerConnection.getTransceivers().forEach(transceiver => {
      transceiver.stop();
    });

    // Close the peer connection.
    // NOTE: webcamStream is intentionally NOT nulled here. The local media
    // stream is persistent (acquired once on mount) and must survive a teardown
    // so the next match can reuse it. Only the RTCPeerConnection is per-match.
    myPeerConnection.close();
    myPeerConnection = null;
    hasRemoteDescription = false;
    remoteIceCandidates = [];

    onCloseVideoCallback();
  }

  // Drop any deferred match that was waiting on the webcam stream, so a stale
  // offer/invite doesn't fire against the wrong stranger after teardown.
  pendingCallerMatch = false;
  pendingVideoOffer = null;

  strangerId = null;
}
