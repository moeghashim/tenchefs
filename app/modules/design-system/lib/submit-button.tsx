import type { ButtonParts } from "./parts.ts";
import type { ReactNode } from "react";
import { useKeptFocus } from "./use-kept-focus.ts";

export function SubmitButton(parts: Omit<ButtonParts, "onClick">): ReactNode {
  useKeptFocus(parts.disabled === true);
  return (
    <button
      className="self-start rounded-md border bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      disabled={parts.disabled}
      type="submit"
    >
      {parts.children}
    </button>
  );
}
