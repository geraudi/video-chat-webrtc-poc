import type { ISignalingGateway } from '@repo/signaling-core/domains/signaling';
import type { Message } from '@repo/signaling-types/messages';

interface WsAttachment {
  connectionId: string;
}

export class CloudflareSignalingGateway implements ISignalingGateway {
  constructor(private ctx: DurableObjectState) {}

  async send(connectionId: string, message: Message): Promise<void> {
    const ws = this.findWebSocket(connectionId);
    if (ws) {
      ws.send(JSON.stringify(message));
    }
  }

  getAttachment(ws: WebSocket): WsAttachment | null {
    const att = ws.deserializeAttachment();
    if (att && typeof att === 'object' && 'connectionId' in att) {
      return att as WsAttachment;
    }
    return null;
  }

  private findWebSocket(connectionId: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.getAttachment(ws);
      if (att?.connectionId === connectionId) return ws;
    }
    return null;
  }
}
