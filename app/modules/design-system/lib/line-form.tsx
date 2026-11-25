import { useCallback, useId, useRef } from "react";
import { LineFormSave } from "./line-form-save.tsx";
import type { ReactNode } from "react";

interface LineFormParts {
  readonly label: string;
  readonly field: string;
  readonly value: string;
  readonly saving: boolean;
  readonly onEdit: (text: string) => void;
  readonly onSubmit: () => void;
  readonly submit?: string;
  readonly submitLast?: boolean;
  readonly children?: ReactNode;
}

const SAVE = "Save";

export function LineForm(parts: LineFormParts): ReactNode {
  const { onEdit, onSubmit } = parts;
  const id = useId();
  const submit = parts.submit ?? SAVE;
  const box = useRef<HTMLInputElement>(null);
  const handleChange = useCallback(() => {
    if (box.current !== null) {
      onEdit(box.current.value);
    }
  }, [onEdit]);
  const submitted = useCallback(() => {
    onSubmit();
  }, [onSubmit]);
  return (
    <form action={submitted} aria-label={parts.label} className="flex flex-col gap-1.5">
      <label className="text-xs text-muted-foreground" htmlFor={id}>
        {parts.field}
      </label>
      <span className="flex gap-2">
        <input
          autoComplete="off"
          className="h-8 min-w-0 flex-1 rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus:border-muted-foreground"
          id={id}
          onChange={handleChange}
          ref={box}
          spellCheck={false}
          type="text"
          value={parts.value}
        />
        {parts.submitLast !== true && <LineFormSave below={false} saving={parts.saving} submit={submit} />}
      </span>
      {parts.children}
      {parts.submitLast === true && <LineFormSave below saving={parts.saving} submit={submit} />}
    </form>
  );
}
