import { Actions, type InitOfferMessage } from '@repo/signaling-types/messages';
import type { IConnectionRepository } from '../domains/connection.js';
import type { ISignalingGateway } from '../domains/signaling.js';

export class FindStranger {
  constructor(
    private repo: IConnectionRepository,
    private gateway: ISignalingGateway
  ) {}

  async execute(
    connectionId: string
  ): Promise<{ status: 'matched' | 'waiting' }> {
    const stranger = await this.repo.findAvailable(connectionId);

    if (!stranger) {
      await this.repo.setAvailable(connectionId);
      return { status: 'waiting' };
    }

    await this.repo.setUnavailable(stranger.id);

    await this.gateway.send(connectionId, {
      action: Actions.INI_OFFER,
      role: 'caller',
      strangerId: stranger.id
    } as InitOfferMessage);

    await this.gateway.send(stranger.id, {
      action: Actions.INI_OFFER,
      role: 'callee',
      strangerId: connectionId
    } as InitOfferMessage);

    return { status: 'matched' };
  }
}
