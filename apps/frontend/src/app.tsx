import { VideoChat } from './components/video-chat';
import { useVideoChat } from './hooks/use-video-chat';

export default function App() {
  const {
    localCam,
    strangerCam,
    isWebSocketConnected,
    stage,
    userId,
    strangerId,
    actions: { onStart, onNext, onStop }
  } = useVideoChat();

  return (
    <div className="min-h-screen bg-background p-4">
      <VideoChat
        localCam={localCam}
        strangerCam={strangerCam}
        isWebSocketConnected={isWebSocketConnected}
        stage={stage}
        userId={userId}
        strangerId={strangerId}
        onStart={onStart}
        onNext={onNext}
        onStop={onStop}
      />
    </div>
  );
}
