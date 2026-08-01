import { Actions, type InitOfferMessage } from '@repo/signaling-types/messages';
import type { IConnectionRepository } from '../domains/connection.js';
import type { ISignalingGateway } from '../domains/signaling.js';

/**
 * Use case: Find a stranger to match with for a video call.
 * - If an available peer exists, atomically claim it and send initOffer to both.
 * - Otherwise, mark the caller as available and wait.
 */
export class FindStranger {
  constructor(
    private repo: IConnectionRepository,
    private gateway: ISignalingGateway
  ) {}

  async execute(
    connectionId: string
  ): Promise<{ status: 'matched' | 'waiting' }> {
    // claimAvailable is atomic: the peer is found AND marked unavailable in a
    // single operation, so two concurrent callers can never match the same peer.
    const stranger = await this.repo.claimAvailable(connectionId);

    if (!stranger) {
      await this.repo.setAvailable(connectionId);
      return { status: 'waiting' };
    }

    // Persist the pairing so the server can notify the remaining peer when one
    // side disconnects without an explicit hangUp (page refresh/close).
    await this.repo.pair(connectionId, stranger.id);

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
