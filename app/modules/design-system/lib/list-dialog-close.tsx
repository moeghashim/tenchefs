import { Close } from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

interface ListDialogCloseParts {
  readonly label: string;
}

export function ListDialogClose(parts: ListDialogCloseParts): ReactNode {
  return (
    <div className="flex justify-end">
      <Close asChild>
        <button
          className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          type="button"
        >
          {parts.label}
        </button>
      </Close>
    </div>
  );
}
