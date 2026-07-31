import type { Message } from '@repo/signaling-types/messages';
import type { ISignalingGateway } from '../domains/signaling.js';

export class ForwardMessage {
  constructor(private gateway: ISignalingGateway) {}

  async execute(
    senderId: string,
    strangerId: string,
    message: Message
  ): Promise<void> {
    const transformedMessage: Message & { senderId?: string } = {
      ...message,
      senderId: senderId
    };

    await this.gateway.send(strangerId, transformedMessage);
  }
}
