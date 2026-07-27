import { Actions, type Message } from '@repo/signaling-types/messages';
import { WebSocket, WebSocketServer } from 'ws';
import { InMemoryConnectionRepository } from '../adapters/repositories/in-memory-connection-repository.js';
import { LocalWebSocketGateway } from '../adapters/gateways/local-websocket-gateway.js';
import { FindStranger } from '../usecases/find-stranger.js';
import { ForwardMessage } from '../usecases/forward-message.js';
import { ConnectPeer } from '../usecases/connect-peer.js';
import { DisconnectPeer } from '../usecases/disconnect-peer.js';

/**
 * Local WebSocket server using Ports & Adapters architecture.
 * Uses InMemoryConnectionRepository and LocalWebSocketGateway for local dev.
 */
class LocalSignalingServer {
  // peers maps connectionId -> WebSocket for direct message delivery
  private peers: Map<string, WebSocket> = new Map();
  
  // Use cases with their dependencies (adapters)
  private findStranger: FindStranger;
  private forwardMessage: ForwardMessage;
  private connectPeer: ConnectPeer;
  private disconnectPeer: DisconnectPeer;
  private wss: WebSocketServer;

  constructor(port: number) {
    // Create adapters
    const repo = new InMemoryConnectionRepository();
    const gateway = new LocalWebSocketGateway(this.peers);

    // Wire up use cases
    this.findStranger = new FindStranger(repo, gateway);
    this.forwardMessage = new ForwardMessage(gateway);
    this.connectPeer = new ConnectPeer(repo);
    this.disconnectPeer = new DisconnectPeer(repo);

    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws: WebSocket) => {
      // Generate a unique connection ID for each peer
      const connectionId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      this.peers.set(connectionId, ws);

      console.log(`[Server] Connection ${connectionId} connected. Total peers: ${this.peers.size}`);

      // Use the ConnectPeer use case
      this.connectPeer.execute(connectionId).catch(err => {
        console.error(`[Server] Error connecting peer ${connectionId}:`, err);
      });

      // Handle messages from this peer
      ws.on('message', data => {
        try {
          const message = JSON.parse(data.toString()) as Message;
          console.log(`[Server] Received ${message.action} from ${connectionId}`);

          this.handleMessage(connectionId, message).catch(err => {
            console.error(`[Server] Error handling ${message.action} from ${connectionId}:`, err);
          });
        } catch (error) {
          console.error(`[Server] Error processing message from ${connectionId}:`, error);
        }
      });

      ws.on('close', () => {
        console.log(`[Server] Connection ${connectionId} disconnected`);
        this.peers.delete(connectionId);
        
        // Use the DisconnectPeer use case
        this.disconnectPeer.execute(connectionId).catch(err => {
          console.error(`[Server] Error disconnecting peer ${connectionId}:`, err);
        });
      });

      ws.on('error', error => {
        console.error(`[Server] Error on connection ${connectionId}:`, error);
      });
    });

    console.log(`[Server] Local signaling server running on ws://localhost:${port}`);
  }

  private async handleMessage(connectionId: string, message: Message): Promise<void> {
    switch (message.action) {
      case Actions.START:
        await this.findStranger.execute(connectionId);
        break;

      case Actions.VIDEO_OFFER:
      case Actions.VIDEO_ANSWER:
      case Actions.NEW_ICE_CANDIDATE:
      case Actions.HANG_UP: {
        const strangerId = (message as any).strangerId;
        if (strangerId) {
          await this.forwardMessage.execute(connectionId, strangerId, message);
        }
        break;
      }

      default:
        console.log(`[Server] Unknown action: ${message.action}`);
    }
  }
}

// Start the server if run directly
const isMainModule = process.argv[1]?.endsWith('local-server/index.ts');
if (isMainModule) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  new LocalSignalingServer(port);
}