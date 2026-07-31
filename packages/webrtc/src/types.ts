import type { Message } from '@repo/signaling-types/messages';

export interface Signaler {
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
}

export function sendToServer(signaler: Signaler, msg: Message): void {
  signaler.send(JSON.stringify(msg));
}
