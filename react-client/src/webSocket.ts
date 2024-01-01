export interface Message {
  type: string;
  name?: string | null;
  target?: string;
  date?: number;
  id?: number;
  sdp?: RTCSessionDescription | null;
  candidate?:  RTCIceCandidate;
}
