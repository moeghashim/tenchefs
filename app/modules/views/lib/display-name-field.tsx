import { useCallback, useSyncExternalStore } from "react";
import { Alert } from "../../design-system/content.tsx";
import type { DisplayNameDraft } from "../../composer/index.ts";
import { LineForm } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";

interface DisplayNameFieldProps {
  readonly draft: DisplayNameDraft;
  readonly field: string;
  readonly label: string;
  readonly saved: string | null;
}

export function DisplayNameField(props: DisplayNameFieldProps): ReactNode {
  const { draft } = props;
  const state = useSyncExternalStore(draft.subscribe, draft.snapshot);
  const handleEdit = draft.edit;
  const { save } = state;
  const value = state.text ?? props.saved ?? "";
  const handleSave = useCallback(() => {
    draft.save(value);
  }, [draft, value]);
  return (
    <LineForm
      field={props.field}
      label={props.label}
      onEdit={handleEdit}
      onSubmit={handleSave}
      saving={save.status === "saving"}
      value={value}
    >
      {save.status === "failed" && <Alert>{`Couldn't save the display name (${save.code}): ${save.message}`}</Alert>}
    </LineForm>
  );
}
