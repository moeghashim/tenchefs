import { CheckField, InputField, PickField } from "../../design-system/controls.tsx";
import type { PromptField, Typed } from "./prompt-fields.ts";
import type { ReactNode } from "react";
import { textIn } from "./prompt-fields.ts";
import { useCallback } from "react";

interface CommandFieldProps {
  readonly field: PromptField;
  readonly typed: Typed;
  readonly error: string | null;
  readonly onEdit: (name: string, value: string | boolean) => void;
}

export function CommandField(props: CommandFieldProps): ReactNode {
  const { error, field, onEdit } = props;
  const { help, name, required } = field;
  const handleEdit = useCallback(
    (value: string | boolean) => {
      onEdit(name, value);
    },
    [name, onEdit],
  );
  const value = props.typed[name];
  if (field.kind === "checkbox") {
    return (
      <CheckField
        checked={value === true}
        error={error}
        help={help}
        label={name}
        onEdit={handleEdit}
        required={required}
      />
    );
  }
  if (field.kind === "pick") {
    return (
      <PickField
        error={error}
        help={help}
        label={name}
        onEdit={handleEdit}
        options={field.options}
        required={required}
        value={textIn(value)}
      />
    );
  }
  return (
    <InputField
      error={error}
      help={help}
      kind={field.kind}
      label={name}
      onEdit={handleEdit}
      required={required}
      value={textIn(value)}
    />
  );
}
