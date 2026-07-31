import type { Message } from '@repo/signaling-types/messages';

export interface ISignalingGateway {
  send(connectionId: string, message: Message): Promise<void>;
}
