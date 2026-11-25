import type { Prompt, PromptField, Typed } from "./prompt-fields.ts";
import { errorText, fieldErrors } from "./prompt-fields.ts";
import type { CallState } from "../../board/index.ts";
import { CommandField } from "./command-field.tsx";
import { DataArea } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { useMemo } from "react";

const TEXT = { data: "Data" } as const;

interface CommandFieldsProps {
  readonly prompt: Prompt;
  readonly fields: readonly PromptField[];
  readonly typed: Typed;
  readonly kept: string;
  readonly call: CallState;
  readonly onEdit: (name: string, value: string | boolean) => void;
  readonly onEditData: (data: string) => void;
}

export function CommandFields(props: CommandFieldsProps): ReactNode {
  const { call, fields } = props;
  const errors = useMemo(() => fieldErrors({ call, fields }), [call, fields]);
  if (props.prompt.kind === "json") {
    return <DataArea label={TEXT.data} name="data" onEdit={props.onEditData} value={props.kept} />;
  }
  return fields.map((field) => (
    <CommandField
      error={errorText(errors.get(field.name) ?? [])}
      field={field}
      key={field.name}
      onEdit={props.onEdit}
      typed={props.typed}
    />
  ));
}
