import { WebSocketServer, WebSocket } from 'ws';
import { Actions, InitOfferMessage, Message } from '@repo/signaling-types/messages';

interface PeerConnection {
  ws: WebSocket;
  connectionId: string;
  isAvailable: boolean;
}

class LocalSignalingServer {
  private peers: Map<string, PeerConnection> = new Map();
  private wss: WebSocketServer;

  constructor(private port: number) {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws: WebSocket) => {
      // Generate a unique connection ID for each peer
      const connectionId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const peer: PeerConnection = {
        ws,
        connectionId,
        isAvailable: false,
      };
      
      this.peers.set(connectionId, peer);
      console.log(`[Server] Connection ${connectionId} connected. Total peers: ${this.peers.size}`);

      // Handle messages from this peer
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as Message;
          console.log(`[Server] Received ${message.action} from ${connectionId}`);
          
          switch (message.action) {
            case Actions.START:
              this.handleStart(connectionId, ws);
              break;
            case Actions.VIDEO_OFFER:
            case Actions.VIDEO_ANSWER:
            case Actions.NEW_ICE_CANDIDATE:
            case Actions.HANG_UP:
              this.forwardMessage(message, connectionId);
              break;
            default:
              console.log(`[Server] Unknown action: ${message.action}`);
          }
        } catch (error) {
          console.error(`[Server] Error processing message from ${connectionId}:`, error);
        }
      });

      ws.on('close', () => {
        console.log(`[Server] Connection ${connectionId} disconnected`);
        this.removePeer(connectionId);
      });

      ws.on('error', (error) => {
        console.error(`[Server] Error on connection ${connectionId}:`, error);
      });
    });

    console.log(`[Server] Local signaling server running on ws://localhost:${port}`);
  }

  private handleStart(requesterId: string, requesterWs: WebSocket): void {
    const requesterPeer = this.peers.get(requesterId);
    if (!requesterPeer) return;

    // Find an available peer
    let otherAvailablePeer: PeerConnection | null = null;
    
    for (const [id, peer] of this.peers.entries()) {
      if (id !== requesterId && peer.isAvailable) {
        otherAvailablePeer = peer;
        break;
      }
    }

    if (otherAvailablePeer) {
      // Match found! Pair them up
      console.log(`[Server] Matched ${requesterId} with ${otherAvailablePeer.connectionId}`);
      
      // Mark both as unavailable
      requesterPeer.isAvailable = false;
      otherAvailablePeer.isAvailable = false;

      // Send INIT_OFFER to both peers
      const callerMessage: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'caller',
        strangerId: otherAvailablePeer.connectionId,
      };
      
      const calleeMessage: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'callee',
        strangerId: requesterId,
      };

      requesterWs.send(JSON.stringify(callerMessage));
      otherAvailablePeer.ws.send(JSON.stringify(calleeMessage));
      
      console.log(`[Server] Sent INIT_OFFER to both peers`);
    } else {
      // No peer available, mark as available and wait
      requesterPeer.isAvailable = true;
      const response: Message = {
        action: Actions.START,
      };
      
      // Send back confirmation
      const ackMessage = JSON.stringify({ message: 'Available', status: 'waiting' });
      requesterWs.send(ackMessage);
      
      console.log(`[Server] ${requesterId} is now available and waiting`);
    }
  }

  private forwardMessage(message: Message, senderId: string): void {
    const senderPeer = this.peers.get(senderId);
    if (!senderPeer) return;

    let targetId: string | null = null;

    // Extract the target peer ID based on message type
    switch (message.action) {
      case Actions.VIDEO_OFFER:
        targetId = (message as any).strangerId;
        break;
      case Actions.VIDEO_ANSWER:
        targetId = (message as any).strangerId;
        break;
      case Actions.NEW_ICE_CANDIDATE:
        targetId = (message as any).strangerId;
        break;
      case Actions.HANG_UP:
        targetId = (message as any).strangerId;
        break;
    }

    if (!targetId) {
      console.log(`[Server] No target ID found for message ${message.action}`);
      return;
    }

    const targetPeer = this.peers.get(targetId);
    if (targetPeer) {
      // Modify the message to use senderId as strangerId for the recipient
      const outgoingMessage = { ...message, strangerId: senderId };
      targetPeer.ws.send(JSON.stringify(outgoingMessage));
      console.log(`[Server] Forwarded ${message.action} from ${senderId} to ${targetId}`);
    } else {
      console.log(`[Server] Target peer ${targetId} not found for message ${message.action}`);
    }
  }

  private removePeer(connectionId: string): void {
    const peer = this.peers.get(connectionId);
    
    // Notify any matching peer if we were matched
    if (peer && peer.isAvailable) {
      // If the available peer disconnects, just remove them
      this.peers.delete(connectionId);
      console.log(`[Server] Removed available peer ${connectionId}`);
      return;
    }

    // Find and notify the other peer if we were matched
    for (const [id, p] of this.peers.entries()) {
      if (p.isAvailable === false && p.connectionId !== connectionId) {
        // This might be the matched peer - in a real app we'd track sessions
        break;
      }
    }

    this.peers.delete(connectionId);
    console.log(`[Server] Removed peer ${connectionId}. Remaining: ${this.peers.size}`);
  }
}

// Start the server if run directly (ESM equivalent of require.main === module)
const isMainModule = process.argv[1] && process.argv[1].endsWith('local-server/index.ts');
if (isMainModule) {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
  new LocalSignalingServer(port);
}
