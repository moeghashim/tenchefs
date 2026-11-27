import type { ReactNode } from "react";
import type { ReactionChoice } from "./menu-parts.ts";

interface ReactButtonParts {
  readonly choice: ReactionChoice;
}

export function ReactButton(parts: ReactButtonParts): ReactNode {
  const { choice } = parts;
  const handleReact = choice.onReact;
  return (
    <button
      aria-keyshortcuts={choice.keys.keys}
      aria-label={`React with ${choice.symbol}`}
      className="block rounded-md border bg-background px-1.5 py-0.5 text-[11px] shadow-sm before:content-[attr(data-symbol)] hover:bg-accent focus-visible:bg-accent"
      data-symbol={choice.symbol}
      onClick={handleReact}
      title={`React with ${choice.symbol}`}
      type="button"
    />
  );
}
