// Create the RTCPeerConnection which knows how to talk to our
// selected STUN/TURN server and then uses getUserMedia() to find
// our camera and microphone and add that stream to the connection for
// use in our video call. Then we configure event handlers to get
// needed notifications on the call.

import {
  Actions,
  HangUpMessage,
  Message,
  NewIceCandidateMessage,
  VideoAnswerInputMessage,
  VideoAnswerOutputMessage,
  VideoOffertInputMessage,
  VideoOffertOutputMessage
} from '../../../core/src/types/messages.ts';

interface ISignaler {
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
}

let signaler: ISignaler;
let strangerStream: MediaStream | null = null;
let strangerId: string | null = null;      // To store username of other peer
let myPeerConnection: RTCPeerConnection | null = null;    // RTCPeerConnection
let candidates: RTCIceCandidate[] = [];
let onTrackCallback: (event: RTCTrackEvent) => void;

function createPeerConnection () {
  log('--> createPeerConnection. Setting up a connection...');

  myPeerConnection = new RTCPeerConnection({
    iceServers: [
      {'urls': 'stun:stun.l.google.com:19302'}
    ]
  });

  // Set up event handlers for the ICE negotiation process.

  myPeerConnection.onicecandidate = handleICECandidateEvent;
  myPeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
  myPeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
  myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
  myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;
  myPeerConnection.ontrack = handleTrackEvent;
}

function log(text: string) {
  const time = new Date();
  console.log("[" + time.toLocaleTimeString() + "] " + text);
}
export function setOnTrackCallBack (callback: (event: RTCTrackEvent) => void) {
  onTrackCallback = callback;
}

export const setSignaler = (mySignaler: ISignaler) => signaler = mySignaler;

export function sendToServer (msg: Message) {
  const msgJSON = JSON.stringify(msg);

  log('--> Sending \'' + msg?.action);
  signaler.send(msgJSON);
}

// Handle a click on an item in the user list by inviting the clicked
// user to video chat. Note that we don't actually send a message to
// the callee here -- calling RTCPeerConnection.addTrack() issues
// a |notificationneeded| event, so we'll let our handler for that
// make the offer.

export async function invite (stream: MediaStream) {
  log('--> Starting to prepare an invitation to a stranger');
  if (myPeerConnection) {
    alert('You can\'t start a call because you already have one open!');
  } else {
    createPeerConnection();
    stream
      .getTracks()
      .forEach((track) => (myPeerConnection as RTCPeerConnection).addTrack(track, stream));
  }
}

// Called by the WebRTC layer to let us know when it's time to
// begin, resume, or restart ICE negotiation.

async function handleNegotiationNeededEvent () {
  log('--> handleNegotiationNeededEvent');
  if (myPeerConnection === null) return;

  try {
    log('    * Creating offer');
    const offer = await myPeerConnection.createOffer();

    if (myPeerConnection.signalingState != 'stable') {
      log('    * The connection isn\'t stable yet; postponing...');
      return;
    }

    log('    * Setting local description to the offer');
    await myPeerConnection.setLocalDescription(offer);

    log('    * Sending the offer to the remote peer');

    const videoOffertMessage: VideoOffertOutputMessage = {
      action: Actions.VIDEO_OFFER,
      sdp: myPeerConnection.localDescription as RTCSessionDescription
    };
    sendToServer(videoOffertMessage);
  } catch (err) {
    log('    * The following error occurred while handling the negotiationneeded event:');
    reportError(err);
  }
}

// Accept an offer to video chat. We configure our local settings,
// create our RTCPeerConnection, get and attach our local camera
// stream, then create and send an answer to the caller.

export async function handleVideoOfferMsg (msg: VideoOffertInputMessage, stream: MediaStream) {
  log('--> handleVideoOfferMsg');

  strangerId = msg.senderId;
  createPeerConnection();

  if (!myPeerConnection) {
    throw new Error('myPeerConnection error');
  }

  const desc = new RTCSessionDescription(msg.sdp);
  await myPeerConnection.setRemoteDescription(desc);

  stream
    .getTracks()
    .forEach((track) => (myPeerConnection as RTCPeerConnection).addTrack(track, stream));

  const answer = await (myPeerConnection as RTCPeerConnection).createAnswer();
  await (myPeerConnection as RTCPeerConnection).setLocalDescription(answer);

  if (!myPeerConnection.localDescription) {
    throw new Error('myPeerConnection.localDescription error');
  }

  const videoAnswerMessage: VideoAnswerOutputMessage = {
    action: Actions.VIDEO_ANSWER,
    senderId: strangerId,
    sdp: myPeerConnection.localDescription
  };
  sendToServer(videoAnswerMessage);
}

// Responds to the "video-answer" message sent to the caller
// once the callee has decided to accept our request to talk.
export async function handleVideoAnswerMsg (msg: VideoAnswerInputMessage) {
  log('--> handleVideoAnswerMsg');
  if (myPeerConnection) {
    strangerId = msg.strangerId;
    const desc = new RTCSessionDescription(msg.sdp);
    await myPeerConnection.setRemoteDescription(desc).catch(reportError);
  }
}

// SENDING ICE CANDIDATES

// Handles |icecandidate| events by forwarding the specified
// ICE candidate (created by our local ICE agent) to the other
// peer through the signaling server.

function handleICECandidateEvent (event: RTCPeerConnectionIceEvent) {
  log('--> handleICECandidateEvent');
  if (event.candidate && strangerId) {
    const newIceCandidateMessage: NewIceCandidateMessage = {
      action: Actions.NEW_ICE_CANDIDATE,
      strangerId: strangerId as string,
      candidate: event.candidate
    };
    sendToServer(newIceCandidateMessage);
  }
}

// RECEIVING ICE CANDIDATES

// A new ICE candidate has been received from the other peer. Call
// RTCPeerConnection.addIceCandidate() to send it along to the
// local ICE framework.

export async function handleNewICECandidateMsg (msg: NewIceCandidateMessage) {
  log('--> handleNewICECandidateMsg');
  const iceCandidate = new RTCIceCandidate(msg.candidate);
  candidates.push(iceCandidate);
  if (!strangerId) {
    log('   * strangerId not set yet, add candidates when done.')
    return;
  }

  log('   * Add candidates');

  const addIceCandidateToPeer = async (candidate: RTCIceCandidate) => {
    try {
      await myPeerConnection?.addIceCandidate(candidate);
    } catch (err) {
      log('    * handleNewICECandidateMsg ERROR')
      console.error(err);
    }
  };

  await Promise.all(candidates.map(addIceCandidateToPeer));
  candidates = [];
}

// RECEIVING NEW STREAMS

function handleTrackEvent (event: RTCTrackEvent) {
  // Set strangerStream
  onTrackCallback(event);
}

// HANGING UP

export function hangUpCall () {
  const hangUpMessage: HangUpMessage = {
    action: Actions.HANG_UP,
    strangerId: strangerId as string
  };
  sendToServer(hangUpMessage);
  closeVideoCall();
}

// ENDING THE CALL

let onCloseVideoCallback = () => {};
export const setOnCloseVideoCallback = (callback: () => void) => onCloseVideoCallback = callback;

// Close the RTCPeerConnection and reset variables so that the user can
// make or receive another call if they wish. This is called both
// when the user hangs up, the other user hangs up, or if a connection
// failure is detected.

export function closeVideoCall () {
  log('--> Closing the peer connection');
  if (myPeerConnection) {
    myPeerConnection.ontrack = null;
    myPeerConnection.onicecandidate = null;
    myPeerConnection.oniceconnectionstatechange = null;
    myPeerConnection.onsignalingstatechange = null;
    myPeerConnection.onicegatheringstatechange = null;
    myPeerConnection.onnegotiationneeded = null;

    myPeerConnection.getTransceivers().forEach(transceiver => {
      transceiver.stop();
    });

    if (strangerStream) {
      strangerStream.getTracks().forEach((track) => track.stop());
    }

    // Close the peer connection
    myPeerConnection.close();
    myPeerConnection = null;
  }

  strangerStream = null;
  strangerId = null;

  onCloseVideoCallback();
}

// Handle |iceconnectionstatechange| events. This will detect
// when the ICE connection is closed, failed, or disconnected.
//
// This is called when the state of the ICE agent changes.

function handleICEConnectionStateChangeEvent () {
  if (myPeerConnection === null) return;

  log(`--> handleICEConnectionStateChangeEvent: ${myPeerConnection.iceConnectionState}`);

  switch (myPeerConnection.iceConnectionState) {
    case 'closed':
    case 'failed':
    case 'disconnected':
      closeVideoCall();
      break;
  }
}

// Set up a |signalingstatechange| event handler. This will detect when
// the signaling connection is closed.
//
// NOTE: This will actually move to the new RTCPeerConnectionState enum
// returned in the property RTCPeerConnection.connectionState when
// browsers catch up with the latest version of the specification!

function handleSignalingStateChangeEvent () {
  if (myPeerConnection === null) return;
  switch (myPeerConnection.signalingState) {
    case 'closed':
      closeVideoCall();
      break;
  }
}

// Handle the |icegatheringstatechange| event. This lets us know what the
// ICE engine is currently working on: "new" means no networking has happened
// yet, "gathering" means the ICE engine is currently gathering candidates,
// and "complete" means gathering is complete. Note that the engine can
// alternate between "gathering" and "complete" repeatedly as needs and
// circumstances change.
//
// We don't need to do anything when this happens, but we log it to the
// console, so you can see what's going on when playing with the sample.

function handleICEGatheringStateChangeEvent () {
  log('--> handleICEGatheringStateChangeEvent. ICE gathering state changed to: ' + myPeerConnection?.iceGatheringState);
}

