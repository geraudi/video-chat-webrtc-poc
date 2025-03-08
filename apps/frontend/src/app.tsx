import { useVideoChat } from './hooks/use-video-chat';
import { VideoChat } from './components/video-chat';

export default function App() {
  const { localCam, strangerCam, isConnected, isChatOn, actions } =
    useVideoChat();

  return (
    <VideoChat
      localCam={localCam}
      strangerCam={strangerCam}
      isConnected={isConnected}
      isChatOn={isChatOn}
      actions={actions}
    />
  );
}
