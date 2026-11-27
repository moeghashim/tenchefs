import { useCallback, useId } from "react";
import type { PanelTitleField } from "./panel-titling-parts.ts";
import type { ReactNode } from "react";
import { useFocusOnOpen } from "./focus-on-open.ts";

interface PanelTitleFormParts {
  readonly field: PanelTitleField;
}

export function PanelTitleForm(parts: PanelTitleFormParts): ReactNode {
  const { error, onSave, onText } = parts.field;
  const errorId = useId();
  const box = useFocusOnOpen<HTMLInputElement>(true);
  const handleChange = useCallback(() => {
    if (box.current !== null) {
      onText(box.current.value);
    }
  }, [box, onText]);
  const handleSave = useCallback(async () => {
    await onSave();
  }, [onSave]);
  return (
    <form action={handleSave} aria-label={parts.field.label} className="flex w-0 min-w-0 flex-1 flex-col gap-0.5">
      <input
        aria-busy={parts.field.saving}
        aria-describedby={errorId}
        aria-invalid={error !== null}
        aria-label={parts.field.field}
        autoComplete="off"
        className="h-7 w-full min-w-0 rounded-md border bg-surface px-2 text-[15px] leading-tight font-semibold text-foreground outline-none focus:border-muted-foreground"
        onChange={handleChange}
        readOnly={parts.field.saving}
        ref={box}
        spellCheck={false}
        type="text"
        value={parts.field.text}
      />
      <p className="truncate text-[11px] leading-tight text-destructive empty:hidden" id={errorId} role="alert">
        {error}
      </p>
    </form>
  );
}
