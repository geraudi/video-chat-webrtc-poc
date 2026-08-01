import {
  Actions,
  type ChatMessageInputMessage,
  type ChatMessageOutputMessage,
  type ReceivedMessage
} from '@repo/signaling-types/messages';
import {
  type Logger,
  type PeerConnectionEngine,
  type Signaler,
  sendToServer
} from '@repo/webrtc';
import type { ChatSessionEvents } from './types';

export function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export class ChatSession {
  readonly userId: string;

  constructor(
    private readonly signaler: Signaler,
    private readonly engine: PeerConnectionEngine,
    private readonly events: ChatSessionEvents = {},
    private readonly logger: Logger = console
  ) {
    this.userId = generateUserId();
  }

  get strangerId(): string | null {
    return this.engine.getStrangerId();
  }

  get role(): 'caller' | 'callee' | null {
    return this.engine.getRole();
  }

  async handleIncomingMessage(msg: ReceivedMessage): Promise<void> {
    this.logger.log(`<-- Received : ${msg.action}`);

    switch (msg.action) {
      case Actions.CHAT_MESSAGE: {
        const chatMsg = msg as ChatMessageOutputMessage;
        this.logger.log(
          `---> CHAT from ${chatMsg.senderId}: ${chatMsg.content}`
        );
        this.events.onChatMessage?.(chatMsg.content, chatMsg.senderId);
        break;
      }

      case Actions.INI_OFFER:
      case Actions.VIDEO_OFFER:
      case Actions.VIDEO_ANSWER:
      case Actions.NEW_ICE_CANDIDATE:
      case Actions.HANG_UP:
      case Actions.TURN_CREDENTIALS:
        await this.engine.handleIncoming(msg);
        break;

      default:
      // nothing to do
    }
  }

  sendChatMessage(content: string): void {
    const strangerId = this.engine.getStrangerId();
    if (!strangerId || !content.trim()) return;
    const msg: ChatMessageInputMessage = {
      action: Actions.CHAT_MESSAGE,
      content: content.trim(),
      strangerId
    };
    sendToServer(this.signaler, msg);
  }

  start(): Promise<void> {
    return this.engine.start();
  }

  hangUp(reason?: 'replacing' | 'stopping'): void {
    this.engine.hangUp(reason);
  }

  replaceTrack(
    kind: 'audio' | 'video',
    track: MediaStreamTrack | null
  ): Promise<void> {
    return this.engine.replaceTrack(kind, track);
  }

  dispose(): void {
    this.engine.dispose();
  }

  setLocalStream(stream: MediaStream): Promise<void> {
    return this.engine.setLocalStream(stream);
  }
}
