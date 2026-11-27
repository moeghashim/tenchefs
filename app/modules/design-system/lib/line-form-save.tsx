import type { ReactNode } from "react";
import { useKeptFocus } from "./use-kept-focus.ts";

interface LineFormSaveParts {
  readonly saving: boolean;
  readonly submit: string;
  readonly below: boolean;
}

const LOOK =
  "rounded-md border bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50";

function classOf(below: boolean): string {
  if (below) {
    return `${LOOK} self-start py-1.5`;
  }
  return LOOK;
}

const SAVING = "Saving…";

export function LineFormSave(parts: LineFormSaveParts): ReactNode {
  useKeptFocus(parts.saving);
  return (
    <button className={classOf(parts.below)} disabled={parts.saving} type="submit">
      {parts.saving && SAVING}
      {!parts.saving && parts.submit}
    </button>
  );
}
