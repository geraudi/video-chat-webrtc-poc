import type { Signaler } from '@repo/webrtc';

export function makeReactWSSignaler(
  sendMessage: (msg: string) => void
): Signaler {
  return {
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      sendMessage(data as string);
    }
  };
}
