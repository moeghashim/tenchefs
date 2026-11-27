import type { ReactNode } from "react";
import { useKeptFocus } from "./use-kept-focus.ts";

const SAVE = "Save";
const SAVING = "Saving…";

interface AreaSaveParts {
  readonly saving: boolean;
}

export function AreaSave(parts: AreaSaveParts): ReactNode {
  useKeptFocus(parts.saving);
  return (
    <button
      className="h-8 rounded-md border bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      disabled={parts.saving}
      type="submit"
    >
      {parts.saving && SAVING}
      {!parts.saving && SAVE}
    </button>
  );
}
