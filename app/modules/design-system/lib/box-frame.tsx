import type { Parts } from "./parts.ts";
import type { ReactNode } from "react";

const FORM = [
  "[&_form]:relative [&_form]:flex-row [&_form]:flex-wrap [&_form]:items-end [&_form]:gap-2 [&_form]:rounded-xl",
  "[&_form]:border [&_form]:bg-surface [&_form]:p-2 [&_form]:shadow-sm [&_form:focus-within]:border-muted-foreground/60",
  "[&_form>div]:flex-1 [&_form_label]:sr-only [&_textarea]:max-h-48 [&_textarea]:min-h-9 [&_textarea]:resize-none",
  "[&_textarea]:border-0 [&_textarea]:bg-transparent [&_textarea]:px-2 [&_textarea]:py-1.5 [&_textarea]:text-[14.5px]",
  "[&_textarea]:field-sizing-content",
].join(" ");

const TEXT = {
  at: "@",
  enter: "Enter",
  mention: " to mention",
  newLine: " for a new line · ",
  send: " to send · ",
  shiftEnter: "Shift+Enter",
} as const;

export function BoxFrame(parts: Parts): ReactNode {
  return (
    <div className={`shrink-0 px-5 pt-1 pb-4 ${FORM}`}>
      {parts.children}
      <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
        <kbd className="font-mono">{TEXT.enter}</kbd>
        {TEXT.send}
        <kbd className="font-mono">{TEXT.shiftEnter}</kbd>
        {TEXT.newLine}
        <kbd className="font-mono">{TEXT.at}</kbd>
        {TEXT.mention}
      </p>
    </div>
  );
}
