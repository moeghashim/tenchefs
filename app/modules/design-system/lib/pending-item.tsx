import type { ReactNode } from "react";
import { RemoveIcon } from "./remove-icon.tsx";

interface PendingItemParts {
  readonly removeLabel: string;
  readonly onRemove: () => void;
  readonly children: ReactNode;
}

export function PendingItem(parts: PendingItemParts): ReactNode {
  const handleRemove = parts.onRemove;
  return (
    <li className="relative flex">
      {parts.children}
      <button
        aria-label={parts.removeLabel}
        className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        onClick={handleRemove}
        title={parts.removeLabel}
        type="button"
      >
        <RemoveIcon />
      </button>
    </li>
  );
}
