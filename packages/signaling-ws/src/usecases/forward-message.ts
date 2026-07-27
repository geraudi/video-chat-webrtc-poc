import type { Message } from '@repo/signaling-types/messages';
import type { ISignalingGateway } from '../domains/signaling.js';

/**
 * Use case: Forward a signaling message from one peer to their stranger.
 */
export class ForwardMessage {
  constructor(private gateway: ISignalingGateway) {}

  async execute(senderId: string, strangerId: string, message: Message): Promise<void> {
    // Transform the message so strangerId is set to senderId and senderId is preserved
    const transformedMessage: Message & { senderId?: string } = {
      ...message,
      senderId: senderId
    };

    await this.gateway.send(strangerId, transformedMessage);
  }
}