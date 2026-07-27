import type { Message } from '@repo/signaling-types/messages';

/**
 * Port (interface) for signaling transport
 */
export interface ISignalingGateway {
  /**
   * Send a message to a specific connection
   */
  send(connectionId: string, message: Message): Promise<void>;
}