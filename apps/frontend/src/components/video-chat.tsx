import type { ChatMessage } from '../hooks/use-video-chat';
import { ChatPanel } from './chat-panel';
import { ControlBar } from './control-bar';
import { VideoTile } from './video-tile';

export interface VideoChatProps {
  localCam: React.RefObject<HTMLVideoElement | null>;
  strangerCam: React.RefObject<HTMLVideoElement | null>;
  isWebSocketConnected: boolean;
  stage: 'idle' | 'searching' | 'connected';
  messages: ChatMessage[];
  userId?: string | null;
  strangerId?: string | null;
  onStart: () => void;
  onNext: () => void;
  onStop: () => void;
  onSendChat: (content: string) => void;
}

type Stage = VideoChatProps['stage'];

type StatusType = 'disconnected' | 'searching' | 'connected';

export function VideoChat({
  localCam,
  strangerCam,
  isWebSocketConnected,
  stage,
  messages,
  userId,
  strangerId,
  onStart,
  onNext,
  onStop,
  onSendChat
}: VideoChatProps) {
  const statusMessage = getStatusMessage(stage, isWebSocketConnected);

  return (
    <div className="flex h-[calc(100vh-2rem)] w-full flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">WebRTC POC</h1>
        <StatusIndicator text={statusMessage.text} type={statusMessage.type} />
      </header>

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[65fr_35fr]">
        {/* Dominant: remote video */}
        <VideoTile
          videoRef={strangerCam}
          label="Stranger camera"
          className="min-h-[240px]"
        />

        {/* Sidebar: local camera, chat, controls */}
        <div className="grid min-h-0 grid-rows-[45fr_40fr_auto] gap-5">
          <VideoTile
            videoRef={localCam}
            label="My Camera"
            muted
            className="min-h-[180px]"
          />
          <ChatPanel
            messages={messages}
            onSend={onSendChat}
            userId={userId ?? null}
          />
          <ControlBar
            stage={stage}
            isWebSocketConnected={isWebSocketConnected}
            onStart={onStart}
            onNext={onNext}
            onStop={onStop}
          />
        </div>
      </div>

      {(userId || strangerId) && (
        <div className="font-mono text-xs text-muted-foreground">
          {userId && <div>Your ID: {userId}</div>}
          {strangerId && <div>Stranger ID: {strangerId}</div>}
        </div>
      )}
    </div>
  );
}

function StatusIndicator({ text, type }: { text: string; type: StatusType }) {
  const dotColor =
    type === 'connected'
      ? 'bg-green-500'
      : type === 'disconnected'
        ? 'bg-red-500'
        : 'bg-blue-500';

  return (
    <div className="flex items-center gap-2">
      <div className={`size-3 rounded-full ${dotColor}`} />
      <span className="text-sm">{text}</span>
    </div>
  );
}

function getStatusMessage(
  stage: Stage,
  isWebSocketConnected: boolean
): { text: string; type: StatusType } {
  switch (stage) {
    case 'idle':
      return {
        text: isWebSocketConnected ? 'Ready' : 'Disconnected',
        type: isWebSocketConnected ? 'connected' : 'disconnected'
      };
    case 'searching':
      return { text: 'Looking for peer...', type: 'searching' };
    case 'connected':
      return { text: 'Connected to stranger', type: 'connected' };
  }
}
