interface VideoTileProps {
  /** Ref the hook attaches the MediaStream to (srcObject). Component owns no stream logic. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Label shown as a placeholder before the stream is attached / for accessibility. */
  label: string;
  /** Local preview should be muted to avoid echo. */
  muted?: boolean;
  /** Layout sizing classes from the parent (flex/grid height). */
  className?: string;
}

/**
 * Bordered, rounded container holding a single <video>.
 *
 * The placeholder label sits BEHIND the video (z-0) so that, while no stream is
 * attached, the label is visible; once the hook assigns `srcObject` to the ref,
 * the video frames paint over it. The <video> is always mounted because the hook
 * reuses the same ref for the app lifetime.
 */
export function VideoTile({
  videoRef,
  label,
  muted = false,
  className
}: VideoTileProps) {
  return (
    <div
      className={`relative min-h-0 overflow-hidden rounded-[20px] border-2 border-foreground bg-background ${className ?? ''}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 grid place-items-center text-center text-sm font-medium text-muted-foreground"
      >
        {label}
      </div>
      <video
        ref={videoRef}
        autoPlay
        muted={muted}
        playsInline
        aria-label={label}
        className="relative z-10 h-full w-full object-cover"
      />
    </div>
  );
}
