import { CONTROL, useFieldIds } from "./field-ids.ts";
import { useCallback, useRef } from "react";
import { FieldLabel } from "./field-label.tsx";
import { FieldNotes } from "./field-notes.tsx";
import type { InputFieldParts } from "./prompt-parts.ts";
import type { ReactNode } from "react";

const STEPS = { date: "any", integer: "1", number: "any", text: "any", time: "60" } as const;
const TYPES = { date: "date", integer: "number", number: "number", text: "text", time: "time" } as const;

export function InputField(parts: InputFieldParts): ReactNode {
  const { onEdit } = parts;
  const ids = useFieldIds(parts);
  const input = useRef<HTMLInputElement>(null);
  const handleChange = useCallback(() => {
    if (input.current !== null) {
      onEdit(input.current.value);
    }
  }, [onEdit]);
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel ids={ids} label={parts.label} required={parts.required} />
      <input
        aria-describedby={ids.describedBy}
        aria-invalid={parts.error !== null}
        autoComplete="off"
        className={CONTROL}
        id={ids.control}
        onChange={handleChange}
        ref={input}
        required={parts.required}
        spellCheck={false}
        step={STEPS[parts.kind]}
        type={TYPES[parts.kind]}
        value={parts.value}
      />
      <FieldNotes error={parts.error} help={parts.help} ids={ids} />
    </div>
  );
}
