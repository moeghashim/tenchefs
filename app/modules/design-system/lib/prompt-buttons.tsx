import type { PromptButtonsParts } from "./prompt-parts.ts";
import type { ReactNode } from "react";

const TEXT = { cancel: "Cancel" } as const;

export function PromptButtons(parts: PromptButtonsParts): ReactNode {
  const handleCancel = parts.onCancel;
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={handleCancel}
        type="button"
      >
        {TEXT.cancel}
      </button>
      <button
        className="rounded-lg border bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        disabled={parts.busy || parts.disabled === true}
        type="submit"
      >
        {parts.busy && parts.busyButton}
        {!parts.busy && parts.button}
      </button>
    </div>
  );
}
