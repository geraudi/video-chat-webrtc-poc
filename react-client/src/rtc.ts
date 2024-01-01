// Create the RTCPeerConnection which knows how to talk to our
// selected STUN/TURN server and then uses getUserMedia() to find
// our camera and microphone and add that stream to the connection for
// use in our video call. Then we configure event handlers to get
// needed notifications on the call.

import { Message } from './webSocket.ts';

let ws: WebSocket;
let strangerStream: MediaStream | null = null;
let myUsername: string | null = null;
let strangerUsername: string | null = null;      // To store username of other peer
let myPeerConnection: RTCPeerConnection | null = null;    // RTCPeerConnection

export const setMyUsername = (username: string) => myUsername = username;
export const setWs = (webSock: WebSocket) => ws = webSock;

export function sendToServer (msg: Message) {
  const msgJSON = JSON.stringify(msg);

  console.log('Sending \'' + msg?.type + '\' message: ' + msgJSON);
  ws.send(msgJSON);
}

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

export const mediaConstraints = {
  audio: true,            // We want an audio track
  video: {
    aspectRatio: {
      ideal: 1.333333     // 3:2 aspect is preferred
    }
  }
};

// Get our hostname

let myHostname = window.location.hostname;
if (!myHostname) {
  myHostname = 'localhost';
}
console.log('Hostname: ' + myHostname);

// Handle a click on an item in the user list by inviting the clicked
// user to video chat. Note that we don't actually send a message to
// the callee here -- calling RTCPeerConnection.addTrack() issues
// a |notificationneeded| event, so we'll let our handler for that
// make the offer.

export async function invite (clickedUsername: string, stream: MediaStream) {
  console.log('Starting to prepare an invitation', clickedUsername);
  if (myPeerConnection) {
    alert('You can\'t start a call because you already have one open!');
  } else {
    strangerUsername = clickedUsername;

    await createPeerConnection();

    // Add the tracks from the stream to the RTCPeerConnection
    stream
      .getTracks()
      .forEach((track) => (myPeerConnection as RTCPeerConnection).addTrack(track, stream));

    console.log('invite', stream.getTracks().length);

    //myStream = stream;
  }
}

// Called by the WebRTC layer to let us know when it's time to
// begin, resume, or restart ICE negotiation.

async function handleNegotiationNeededEvent () {
  console.log('*** Negotiation needed');
  if (myPeerConnection === null) return;

  try {
    console.log('---> Creating offer');
    const offer = await myPeerConnection.createOffer();

    if (myPeerConnection.signalingState != 'stable') {
      console.log('     -- The connection isn\'t stable yet; postponing...');
      return;
    }

    console.log('---> Setting local description to the offer');
    await myPeerConnection.setLocalDescription(offer);

    console.log('---> Sending the offer to the remote peer');
    sendToServer({
      name: myUsername as string,
      target: strangerUsername as string,
      type: 'video-offer',
      sdp: myPeerConnection.localDescription
    });
  } catch (err) {
    console.log('*** The following error occurred while handling the negotiationneeded event:');
    reportError(err);
  }
}

// Accept an offer to video chat. We configure our local settings,
// create our RTCPeerConnection, get and attach our local camera
// stream, then create and send an answer to the caller.

export async function handleVideoOfferMsg (msg: Message, stream: MediaStream) {
  console.log('handleVideoOfferMsg', msg);
  strangerUsername = msg.name as string;
  createPeerConnection();

  if (!myPeerConnection) return;
  if (!msg.sdp) return;

  const desc = new RTCSessionDescription(msg.sdp);
  await myPeerConnection.setRemoteDescription(desc);

  await stream
    .getTracks()
    .forEach((track) => (myPeerConnection as RTCPeerConnection).addTrack(track, stream));

  console.log('handleVideoOfferMsg', stream.getTracks().length);
  //myStream = stream;

  const answer = await (myPeerConnection as RTCPeerConnection).createAnswer();
  await (myPeerConnection as RTCPeerConnection).setLocalDescription(answer);

  sendToServer({
    name: myUsername,
    target: strangerUsername as string,
    type: 'video-answer',
    sdp: (myPeerConnection as RTCPeerConnection).localDescription
  });
}

// Responds to the "video-answer" message sent to the caller
// once the callee has decided to accept our request to talk.
export async function handleVideoAnswerMsg (msg: Message) {
  if (msg.sdp && myPeerConnection) {
    const desc = new RTCSessionDescription(msg.sdp);
    await myPeerConnection.setRemoteDescription(desc).catch(reportError);
  }
}

// SENDING ICE CANDIDATES

// Handles |icecandidate| events by forwarding the specified
// ICE candidate (created by our local ICE agent) to the other
// peer through the signaling server.

function handleICECandidateEvent (event: RTCPeerConnectionIceEvent) {
  if (event.candidate) {
    console.log('*** Outgoing ICE candidate: ' + event.candidate.candidate);

    sendToServer({
      type: 'new-ice-candidate',
      target: strangerUsername as string,
      candidate: event.candidate
    });
  }
}

// RECEIVING ICE CANDIDATES

// A new ICE candidate has been received from the other peer. Call
// RTCPeerConnection.addIceCandidate() to send it along to the
// local ICE framework.

export async function handleNewICECandidateMsg (msg: Message) {
  var candidate = new RTCIceCandidate(msg.candidate);

  console.log('*** Adding received ICE candidate: ' + JSON.stringify(candidate));
  try {
    await myPeerConnection?.addIceCandidate(candidate);
  } catch (err) {
    reportError(err);
  }
}

// RECEIVING NEW STREAMS

function handleTrackEvent (event: RTCTrackEvent) {
  // Set strangerStream
  onTrackCallback(event);
}

// HANGING UP

export function hangUpCall () {
  console.log('*** Received hang up notification from other peer');
  sendToServer({
    name: myUsername,
    target: strangerUsername as string,
    type: 'hang-up'
  });

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
  console.log('Closing the call');
  if (myPeerConnection) {
    console.log('--> Closing the peer connection');

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
  strangerUsername = null;

  onCloseVideoCallback();
}

// Handle |iceconnectionstatechange| events. This will detect
// when the ICE connection is closed, failed, or disconnected.
//
// This is called when the state of the ICE agent changes.

function handleICEConnectionStateChangeEvent () {
  if (myPeerConnection === null) return;
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
// console so you can see what's going on when playing with the sample.

function handleICEGatheringStateChangeEvent () {
  console.log('*** ICE gathering state changed to: ' + myPeerConnection?.iceGatheringState);
}

async function createPeerConnection () {
  console.log('Setting up a connection...');

  // Create an RTCPeerConnection which knows to use our chosen
  // STUN server.

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

let onTrackCallback = (event: RTCTrackEvent) => {
  console.log('basic on track event.', event);
};

export function setOnTrackCallBack (callback: (event: RTCTrackEvent) => void) {
  onTrackCallback = callback;
}

