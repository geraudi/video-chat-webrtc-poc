import { Actions, type HangUpMessage } from '@repo/signaling-types/messages';
import type { IConnectionRepository } from '../domains/connection.js';
import type { ISignalingGateway } from '../domains/signaling.js';

/**
 * Use case: Handle a WebSocket disconnection (peer unregister).
 *
 * If the peer was matched, notify their stranger with a HANG_UP so the other
 * side can immediately close the call and look for a new peer (this is what
 * happens when a user refreshes/closes the page without hanging up explicitly).
 */
export class DisconnectPeer {
  constructor(
    private repo: IConnectionRepository,
    private gateway: ISignalingGateway
  ) {}

  async execute(connectionId: string): Promise<void> {
    const strangerId = await this.repo.getStranger(connectionId);

    if (strangerId) {
      await this.gateway.send(strangerId, {
        action: Actions.HANG_UP,
        strangerId: connectionId
      } as HangUpMessage);
      await this.repo.unpair(strangerId, connectionId);
    }

    await this.repo.delete(connectionId);
  }
}
