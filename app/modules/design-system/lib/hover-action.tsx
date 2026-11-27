import type { LinkParts } from "./parts.ts";
import type { ReactNode } from "react";
import { useCallback } from "react";

interface HoverActionParts extends LinkParts {
  readonly name: string;
  readonly keys?: string;
  readonly onFollow: (() => void) | null;
}

export function HoverAction(parts: HoverActionParts): ReactNode {
  const { onFollow } = parts;
  const handleFollow = useCallback(() => {
    if (onFollow !== null) {
      onFollow();
    }
  }, [onFollow]);
  return (
    <a
      aria-keyshortcuts={parts.keys}
      aria-label={parts.name}
      className="block rounded-md border bg-background px-1.5 py-0.5 text-muted-foreground shadow-sm hover:text-foreground focus-visible:text-foreground"
      href={parts.href}
      onClick={handleFollow}
      title={parts.name}
    >
      {parts.children}
    </a>
  );
}
