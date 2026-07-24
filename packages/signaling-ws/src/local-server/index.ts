import {
  Actions,
  type InitOfferMessage,
  type Message
} from '@repo/signaling-types/messages';
import { type WebSocket, WebSocketServer } from 'ws';

interface PeerConnection {
  ws: WebSocket;
  connectionId: string;
  isAvailable: boolean;
}

class LocalSignalingServer {
  private peers: Map<string, PeerConnection> = new Map();
  private wss: WebSocketServer;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws: WebSocket) => {
      // Generate a unique connection ID for each peer
      const connectionId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const peer: PeerConnection = {
        ws,
        connectionId,
        isAvailable: false
      };

      this.peers.set(connectionId, peer);
      console.log(
        `[Server] Connection ${connectionId} connected. Total peers: ${this.peers.size}`
      );

      // Handle messages from this peer
      ws.on('message', data => {
        try {
          const message = JSON.parse(data.toString()) as Message;
          console.log(
            `[Server] Received ${message.action} from ${connectionId}`
          );

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
            case Actions.WAITING:
              // Client sending waiting acknowledgement, no action needed
              break;
            default:
              console.log(`[Server] Unknown action: ${message.action}`);
          }
        } catch (error) {
          console.error(
            `[Server] Error processing message from ${connectionId}:`,
            error
          );
        }
      });

      ws.on('close', () => {
        console.log(`[Server] Connection ${connectionId} disconnected`);
        this.removePeer(connectionId);
      });

      ws.on('error', error => {
        console.error(`[Server] Error on connection ${connectionId}:`, error);
      });
    });

    console.log(
      `[Server] Local signaling server running on ws://localhost:${port}`
    );
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
      console.log(
        `[Server] Matched ${requesterId} with ${otherAvailablePeer.connectionId}`
      );

      // Mark both as unavailable
      requesterPeer.isAvailable = false;
      otherAvailablePeer.isAvailable = false;

      // Send INIT_OFFER to both peers
      // callerMessage: the requester is the caller, strangerId points to who they're calling
      const callerMessage: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'caller',
        senderId: requesterId,
        strangerId: otherAvailablePeer.connectionId
      };

      // calleeMessage: the other peer is the callee, senderId is who called them
      const calleeMessage: InitOfferMessage = {
        action: Actions.INI_OFFER,
        role: 'callee',
        senderId: requesterId,
        strangerId: otherAvailablePeer.connectionId
      };

      requesterWs.send(JSON.stringify(callerMessage));
      otherAvailablePeer.ws.send(JSON.stringify(calleeMessage));

      console.log(`[Server] Sent INIT_OFFER to both peers`);
    } else {
      // No peer available, mark as available and wait
      requesterPeer.isAvailable = true;

      // Send a WaitingMessage to the requester
      const waitingMessage: Message = {
        action: Actions.WAITING
      };
      requesterWs.send(JSON.stringify(waitingMessage));

      console.log(`[Server] ${requesterId} is now available and waiting`);
    }
  }

  private forwardMessage(message: Message, senderId: string): void {
    const senderPeer = this.peers.get(senderId);
    if (!senderPeer) return;

    // Extract the target peer ID based on message type
    let targetId: string | null = null;
    
    switch (message.action) {
      case Actions.VIDEO_OFFER:
        targetId = (message as any).strangerId;
        break;
      case Actions.VIDEO_ANSWER:
        // videoAnswer uses `senderId` field for the target connection (the caller's connectionId)
        targetId = (message as any).senderId ?? (message as any).strangerId;
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
      // Include senderId so the receiver knows who sent the message.
      // Only set strangerId if not already present to avoid overwriting.
      const outgoingMessage: Message & { senderId?: string; strangerId?: string } = { 
        ...message, 
        senderId
      };
      // Set strangerId only if it wasn't already in the message (for single-peer forwarding)
      if (!(outgoingMessage as any).strangerId) {
        (outgoingMessage as any).strangerId = senderId;
      }
      targetPeer.ws.send(JSON.stringify(outgoingMessage));
      console.log(
        `[Server] Forwarded ${message.action} from ${senderId} to ${targetId}`
      );
    } else {
      console.log(
        `[Server] Target peer ${targetId} not found for message ${message.action}`
      );
    }
  }

  private removePeer(connectionId: string): void {
    const peer = this.peers.get(connectionId);
    if (!peer) return;

    // If the disconnecting peer was available (waiting for a match), 
    // notify any waiting peer that they're now alone
    if (peer.isAvailable) {
      console.log(`[Server] Available peer ${connectionId} disconnected`);
    } else {
      // If the disconnecting peer was matched, the other peer should know
      // Find the matched peer and notify them
      for (const [id, p] of this.peers.entries()) {
        if (p.connectionId === connectionId) continue;
        if (!p.isAvailable) {
          // This peer was in a matched state — send a hangUp-like notification
          const hangUpMsg = JSON.stringify({ action: Actions.HANG_UP });
          p.ws.send(hangUpMsg);
          console.log(
            `[Server] Notified matched peer ${id} that their peer disconnected`
          );
          // Reset the other peer's available state so they can match again
          p.isAvailable = true;
        }
      }
    }

    this.peers.delete(connectionId);
    console.log(
      `[Server] Removed peer ${connectionId}. Remaining: ${this.peers.size}`
    );
  }
}

// Start the server if run directly (ESM equivalent of require.main === module)
const isMainModule = process.argv[1]?.endsWith('local-server/index.ts');
if (isMainModule) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  new LocalSignalingServer(port);
}
