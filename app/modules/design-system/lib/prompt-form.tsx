import { useEffect, useRef } from "react";
import { PromptButtons } from "./prompt-buttons.tsx";
import type { PromptFormParts } from "./prompt-parts.ts";
import type { ReactNode } from "react";

const FIRST_FIELD = "input, select, textarea";

export function PromptForm(parts: PromptFormParts): ReactNode {
  const handleCancel = parts.onCancel;
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const shown = form.current;
    if (shown !== null) {
      const field = shown.querySelector<HTMLElement>(FIRST_FIELD);
      if (field !== null) {
        field.focus();
      }
    }
  }, []);
  return (
    <form
      action={parts.onSubmit}
      aria-label={parts.label}
      className="mx-5 mt-1 mb-4 flex shrink-0 flex-col gap-3 rounded-xl border bg-surface p-3 shadow-sm focus-within:border-muted-foreground/60"
      ref={form}
    >
      <p className="flex items-baseline gap-2 px-1">
        <span className="font-mono text-sm font-semibold text-foreground">{parts.title}</span>
        {parts.description !== null && <span className="text-xs text-muted-foreground">{parts.description}</span>}
      </p>
      <div className="flex flex-col gap-3 px-1">{parts.children}</div>
      <PromptButtons busy={parts.busy} busyButton={parts.busyButton} button={parts.button} onCancel={handleCancel} />
    </form>
  );
}
