import type { TurnCredentialsMessage } from '@repo/signaling-types/messages';
import { Actions } from '@repo/signaling-types/messages';
import type { ISignalingGateway } from '../domains/signaling.js';
import type { ITurnCredentialGateway } from '../domains/turn-credential.js';

/**
 * Use case: issue short-lived TURN credentials and push them back to the
 * requesting connection. Mirrors ForwardMessage — two injected ports, no
 * business logic beyond the orchestration.
 */
export class RequestTurnCredentials {
  constructor(
    private readonly turnGateway: ITurnCredentialGateway,
    private readonly signaling: ISignalingGateway
  ) {}

  async execute(connectionId: string): Promise<void> {
    const config = await this.turnGateway.fetchIceServers();

    const message: TurnCredentialsMessage = {
      action: Actions.TURN_CREDENTIALS,
      iceServers: config.iceServers,
      expiresAt: config.expiresAt
    };

    await this.signaling.send(connectionId, message);
  }
}
