import { Button } from '@/components/ui/button';
import { VideoChat } from './components/video-chat';
import { useVideoChat } from './hooks/use-video-chat';

export default function App() {
  const { localCam, strangerCam, isConnected, isChatOn, actions } =
    useVideoChat();

  return (
    <div className="min-h-screen bg-background p-4">
      <Button onClick={() => console.log('Hello from shadcn!')}>
        Test shadcn Button
      </Button>
      <VideoChat
        localCam={localCam}
        strangerCam={strangerCam}
        isConnected={isConnected}
        isChatOn={isChatOn}
        actions={actions}
      />
    </div>
  );
}
