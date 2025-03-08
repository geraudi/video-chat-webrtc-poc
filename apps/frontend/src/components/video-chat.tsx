import { RefObject } from 'react';

interface VideoChatProps {
  localCam: RefObject<HTMLVideoElement | null>;
  strangerCam: RefObject<HTMLVideoElement | null>;
  isConnected: boolean;
  isChatOn: boolean;
  actions: {
    start: () => void;
    stop: () => void;
    next: () => void;
  };
}

export function VideoChat({
  localCam,
  strangerCam,
  isConnected,
  isChatOn,
  actions,
}: VideoChatProps) {
  return (
    <>
      <div className="grid grid-cols-2">
        <div>
          <video
            className="w-full h-full border-blue-500 border-4"
            ref={strangerCam}
            autoPlay
          ></video>
        </div>
        <div>
          <video
            className="w-full h-full border-blue-500 border-4"
            ref={localCam}
            autoPlay
          />
        </div>
      </div>

      <div className="grid grid-cols-2 h-10">
        <div className="bg-white">
          <div>{isConnected ? 'Connected' : 'Not connected'}</div>
          {isChatOn ? (
            <button
              className="disabled:bg-gray-500 text-xl py-8 px-10 m-2 bg-pink-400 text-white rounded-xl"
              onClick={actions.next}
              disabled={!isConnected}
            >
              Next
            </button>
          ) : (
            <button
              className="disabled:bg-gray-500 text-xl py-8 px-10 m-2 bg-pink-400 text-black rounded-xl"
              onClick={actions.start}
              disabled={!isConnected}
            >
              Start
            </button>
          )}
          <button
            className="disabled:bg-gray-400 text-xl py-8 px-10 m-2 bg-fuchsia-700 text-white rounded-xl"
            onClick={actions.stop}
            disabled={!isChatOn}
          >
            Stop
          </button>
        </div>
        <div className="bg-gray-800 flex flex-col flex-1"></div>
      </div>
    </>
  );
}
