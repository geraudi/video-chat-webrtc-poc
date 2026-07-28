import { Button } from './ui/button';

type Stage = 'idle' | 'searching' | 'connected';

interface ControlBarProps {
  stage: Stage;
  isWebSocketConnected: boolean;
  onStart: () => void;
  onNext: () => void;
  onStop: () => void;
}

/**
 * Primary action button (Start / Looking... / Next) plus the secondary Stop
 * button. The primary button is driven by the `stage` state machine — the
 * single source of truth — exactly as the previous monolithic component did.
 */
export function ControlBar({
  stage,
  isWebSocketConnected,
  onStart,
  onNext,
  onStop
}: ControlBarProps) {
  const buttonConfig = getButtonConfig(stage, isWebSocketConnected);

  return (
    <div className="flex gap-3">
      {buttonConfig && (
        <Button
          variant="default"
          className="h-10 flex-1 rounded-[10px] px-5"
          onClick={buttonConfig.action === 'start' ? onStart : onNext}
          disabled={buttonConfig.disabled}
        >
          {buttonConfig.label}
        </Button>
      )}

      {/* Stop is only meaningful while searching or connected. */}
      {stage !== 'idle' && (
        <Button
          variant="outline"
          className="h-10 rounded-[10px] px-5"
          onClick={onStop}
        >
          Stop
        </Button>
      )}
    </div>
  );
}

type ButtonConfig = {
  label: string;
  action: 'start' | 'next';
  disabled: boolean;
};

/**
 * Derive the primary button config from the current stage.
 * Kept as the single source of truth to avoid duplicating stage logic.
 */
function getButtonConfig(
  stage: Stage,
  isWebSocketConnected: boolean
): ButtonConfig | null {
  switch (stage) {
    case 'idle':
      return {
        label: 'Start',
        action: 'start',
        disabled: !isWebSocketConnected
      };
    case 'searching':
      return {
        label: 'Looking...',
        action: 'next',
        disabled: true
      };
    case 'connected':
      return {
        label: 'Next',
        action: 'next',
        disabled: false
      };
  }
}
