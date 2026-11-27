import type { ButtonParts } from "./parts.ts";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { useFocusOnOpen } from "./focus-on-open.ts";
import { useKeptFocus } from "./use-kept-focus.ts";

export function Button(parts: ButtonParts): ReactNode {
  const { onClick, unavailable } = parts;
  const button = useFocusOnOpen<HTMLButtonElement>(parts.focused === true);
  const handleClick = useCallback(() => {
    if (unavailable !== true) {
      onClick();
    }
  }, [onClick, unavailable]);
  useKeptFocus(parts.disabled === true);
  return (
    <button
      className="self-start rounded-md border bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 aria-disabled:opacity-50"
      aria-disabled={unavailable}
      disabled={parts.disabled}
      onClick={handleClick}
      ref={button}
      type="button"
    >
      {parts.children}
    </button>
  );
}
