export interface Message {
  type: string;
  name?: string | null;
  target?: string;
  date?: number;
  id?: number;
  sdp?: RTCSessionDescription | null;
  candidate?:  RTCIceCandidate;
}

export function sendToServer (ws: WebSocket, msg: Message) {
  const msgJSON = JSON.stringify(msg);

  console.log('Sending \'' + msg?.type + '\' message: ' + msgJSON);
  ws.send(msgJSON);
}
