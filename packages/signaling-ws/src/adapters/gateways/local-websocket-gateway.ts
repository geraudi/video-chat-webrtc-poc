import type { ISignalingGateway } from '@repo/signaling-core/domains/signaling';
import type { Message } from '@repo/signaling-types/messages';

/**
 * Local development transport adapter using WebSocket connections
 */
export class LocalWebSocketGateway implements ISignalingGateway {
  constructor(private peers: Map<string, { send: (data: string) => void }>) {}

  async send(connectionId: string, message: Message): Promise<void> {
    const peer = this.peers.get(connectionId);
    if (peer) {
      peer.send(JSON.stringify(message));
    }
  }
}
