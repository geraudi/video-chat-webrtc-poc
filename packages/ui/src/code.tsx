import {ReactNode} from "react";

export function Code({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return <code className={className}>{children}</code>;
}
