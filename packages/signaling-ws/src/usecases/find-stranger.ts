import { Actions, type InitOfferMessage } from '@repo/signaling-types/messages';
import type { IConnectionRepository } from '../domains/connection.js';
import type { ISignalingGateway } from '../domains/signaling.js';

/**
 * Use case: Find a stranger to match with for a video call.
 * - If an available peer exists, match them together and send initOffer to both.
 * - Otherwise, mark the caller as available and wait.
 */
export class FindStranger {
  constructor(
    private repo: IConnectionRepository,
    private gateway: ISignalingGateway
  ) {}

  async execute(connectionId: string): Promise<{ status: 'matched' | 'waiting' }> {
    const stranger = await this.repo.findAvailable(connectionId);

    if (!stranger) {
      await this.repo.setAvailable(connectionId);
      return { status: 'waiting' };
    }

    // Both peers are matched — mark the stranger as unavailable
    await this.repo.setUnavailable(stranger.id);

    // Notify the caller (original requester)
    await this.gateway.send(connectionId, {
      action: Actions.INI_OFFER,
      role: 'caller',
      strangerId: stranger.id
    } as InitOfferMessage);

    // Notify the callee (found peer)
    await this.gateway.send(stranger.id, {
      action: Actions.INI_OFFER,
      role: 'callee',
      strangerId: connectionId
    } as InitOfferMessage);

    return { status: 'matched' };
  }
}