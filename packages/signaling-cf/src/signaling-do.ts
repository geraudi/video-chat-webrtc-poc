import { DurableObject } from 'cloudflare:workers';
import { Actions, type Message, type TurnCredentialsMessage } from '@repo/signaling-types/messages';
import { CloudflareSignalingGateway } from './adapters/gateways/cloudflare-signaling-gateway.js';
import { MeteredTurnCredentialGateway } from './adapters/gateways/metered-turn-credential-gateway.js';
import { DoConnectionRepository } from './adapters/repositories/do-connection-repository.js';
import { ConnectPeer } from './usecases/connect-peer.js';
import { DisconnectPeer } from './usecases/disconnect-peer.js';
import { FindStranger } from './usecases/find-stranger.js';
import { ForwardMessage } from './usecases/forward-message.js';
import { RequestTurnCredentials } from './usecases/request-turn-credentials.js';

export interface Env {
  SIGNALING_DO: DurableObjectNamespace<SignalingDO>;
  METERED_APP_DOMAIN: string;
  METERED_SECRET_KEY: string;
}

export class SignalingDO extends DurableObject<Env> {
  private gateway: CloudflareSignalingGateway;
  private repo: DoConnectionRepository;
  private findStranger: FindStranger;
  private forwardMessage: ForwardMessage;
  private connectPeer: ConnectPeer;
  private disconnectPeer: DisconnectPeer;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS connections (
          id TEXT PRIMARY KEY,
          is_available INTEGER DEFAULT 0
        )
      `);
    });

    this.gateway = new CloudflareSignalingGateway(ctx);
    this.repo = new DoConnectionRepository(ctx);
    this.findStranger = new FindStranger(this.repo, this.gateway);
    this.forwardMessage = new ForwardMessage(this.gateway);
    this.connectPeer = new ConnectPeer(this.repo);
    this.disconnectPeer = new DisconnectPeer(this.repo);
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);

    const connectionId = crypto.randomUUID();
    server.serializeAttachment({ connectionId });

    await this.connectPeer.execute(connectionId);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const att = this.gateway.getAttachment(ws);
    if (!att) return;

    const connectionId = att.connectionId;
    const msg = JSON.parse(message.toString()) as Message;

    switch (msg.action) {
      case Actions.START: {
        await this.findStranger.execute(connectionId);
        break;
      }

      case Actions.VIDEO_OFFER:
      case Actions.VIDEO_ANSWER:
      case Actions.NEW_ICE_CANDIDATE:
      case Actions.HANG_UP: {
        const strangerId = (msg as any).strangerId;
        if (strangerId) {
          await this.forwardMessage.execute(connectionId, strangerId, msg);
        }
        break;
      }

      case Actions.REQUEST_TURN_CREDENTIALS: {
        if (!this.env.METERED_APP_DOMAIN || !this.env.METERED_SECRET_KEY) {
          await this.gateway.send(connectionId, {
            action: Actions.TURN_CREDENTIALS,
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
            expiresAt: Date.now() + 3600_000
          } as TurnCredentialsMessage);
          break;
        }
        try {
          const turnGateway = new MeteredTurnCredentialGateway(
            this.env.METERED_APP_DOMAIN,
            this.env.METERED_SECRET_KEY
          );
          const uc = new RequestTurnCredentials(turnGateway, this.gateway);
          await uc.execute(connectionId);
        } catch (err) {
          console.error('TURN credential fetch failed:', err);
        }
        break;
      }
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ) {
    const att = this.gateway.getAttachment(ws);
    if (!att) return;
    await this.disconnectPeer.execute(att.connectionId);
  }
}
