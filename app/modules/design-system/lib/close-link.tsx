import type { ReactNode } from "react";
import { useCallback } from "react";

interface CloseLinkParts {
  readonly href: string;
  readonly label: string;
  readonly onFollow: (() => void) | null;
}

export function CloseLink(parts: CloseLinkParts): ReactNode {
  const { onFollow } = parts;
  const handleFollow = useCallback(() => {
    if (onFollow !== null) {
      onFollow();
    }
  }, [onFollow]);
  return (
    <a
      aria-label={parts.label}
      className="order-2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      href={parts.href}
      onClick={handleFollow}
    >
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        viewBox="0 0 16 16"
      >
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeLinecap="round" />
      </svg>
    </a>
  );
}
