import { Button } from "./ui/button";

export interface VideoChatProps {
  localCam: React.RefObject<HTMLVideoElement | null>;
  strangerCam: React.RefObject<HTMLVideoElement | null>;
  isWebSocketConnected: boolean;
  stage: "idle" | "searching" | "connected";
  userId?: string | null;
  strangerId?: string | null;
  onStart: () => void;
  onNext: () => void;
  onStop: () => void;
}

/**
 * Button configuration for the current stage.
 * Derived from stage to avoid duplicating logic in the component.
 */
type ButtonConfig = {
  label: string;
  action: "start" | "next" | "stop";
  disabled: boolean;
};

export function VideoChat({
  localCam,
  strangerCam,
  isWebSocketConnected,
  stage,
  userId,
  strangerId,
  onStart,
  onNext,
  onStop
}: VideoChatProps) {
  // Derive button config from stage (single source of truth)
  const getButtonConfig = (): ButtonConfig | null => {
    switch (stage) {
      case "idle":
        return {
          label: "Start",
          action: "start",
          disabled: !isWebSocketConnected
        };
      case "searching":
        return {
          label: "Looking...",
          action: "next",
          disabled: true
        };
      case "connected":
        return {
          label: "Next",
          action: "next",
          disabled: false
        };
    }
  };

  const buttonConfig = getButtonConfig();

  // Status messages for each stage
  const getStatusMessage = (): { text: string; type: "disconnected" | "searching" | "connected" } | null => {
    switch (stage) {
      case "idle":
        return { text: isWebSocketConnected ? "Ready" : "Disconnected", type: isWebSocketConnected ? "connected" : "disconnected" };
      case "searching":
        return { text: "Looking for peer...", type: "searching" };
      case "connected":
        return { text: "Connected to stranger", type: "connected" };
    }
  };

  const statusMessage = getStatusMessage();

  // Render the button based on config
  const renderButton = (config: ButtonConfig) => {
      return (
        <Button
          data-testid="action-button"
          onClick={config.action === "start" ? onStart : onNext}
          disabled={config.disabled}
        >
          {config.label}
        </Button>
      );
  };

  // Render control buttons based on stage
  const renderControls = () => {
    // Idle phase: only Start button
    if (stage === "idle") {
      return buttonConfig ? renderButton(buttonConfig) : null;
    }

    // Searching or connected phases: Next/Looking + Stop buttons
    if (!buttonConfig) return null;

    return (
      <div className="flex gap-4">
        {renderButton(buttonConfig)}
        <Button onClick={onStop}>
          Stop
        </Button>
      </div>
    );
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-100 p-4">
      <h1 className="mb-6 text-4xl font-bold">WebRTC POC</h1>

      {/* Video Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Local Video */}
        <div className="flex flex-col items-center">
          <video
            ref={localCam}
            autoPlay
            muted
            playsInline
            data-testid="local-video"
            className="rounded-lg shadow-lg w-[320px] h-[240px] object-cover bg-gray-900"
          />
          <p className="mt-2 text-sm font-medium">You</p>
        </div>

        {/* Remote Video */}
        <div className="flex flex-col items-center">
          <video
            ref={strangerCam}
            autoPlay
            playsInline
            data-testid="stranger-video"
            className="rounded-lg shadow-lg w-[320px] h-[240px] object-cover bg-gray-900"
          />
          <p className="mt-2 text-sm font-medium">Stranger</p>
        </div>
      </div>

      {/* Controls - single consolidated block */}
      {renderControls()}

      {/* Status Indicator */}
      <div className="mt-4 flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${
            statusMessage?.type === "connected" ? 'bg-green-500' : statusMessage?.type === "disconnected" ? 'bg-red-500' : 'bg-blue-500'
          }`}
        />
        <span className="text-sm">
          {statusMessage?.text ?? (isWebSocketConnected ? 'Connected' : 'Disconnected')}
        </span>
      </div>

      {/* Debugging Info */}
      {(userId || strangerId) && (
        <div className="mt-4 text-xs text-gray-500 font-mono">
          <div className="flex flex-col gap-1">
            {userId && (
              <span>
                <strong>Your ID:</strong> {userId}
              </span>
            )}
            {strangerId && (
              <span>
                <strong>Stranger ID:</strong> {strangerId}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}