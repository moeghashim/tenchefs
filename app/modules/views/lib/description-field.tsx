import { useCallback, useSyncExternalStore } from "react";
import { Alert } from "../../design-system/content.tsx";
import { AreaForm } from "../../design-system/controls.tsx";
import type { DisplayNameDraft } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { descriptionLength } from "../../identities/client.ts";

const TEXT = { description: "Description" } as const;

interface DescriptionFieldProps {
  readonly draft: DisplayNameDraft;
  readonly saved: string | null;
}

export function DescriptionField(props: DescriptionFieldProps): ReactNode {
  const { draft } = props;
  const state = useSyncExternalStore(draft.subscribe, draft.snapshot);
  const handleEdit = draft.edit;
  const { save } = state;
  const value = state.text ?? props.saved ?? "";
  const handleSave = useCallback(() => {
    draft.save(value);
  }, [draft, value]);
  return (
    <AreaForm
      field={TEXT.description}
      label={TEXT.description}
      limit={descriptionLength.maximum}
      onEdit={handleEdit}
      onSubmit={handleSave}
      saving={save.status === "saving"}
      value={value}
    >
      {save.status === "failed" && <Alert>{`Couldn't save the description (${save.code}): ${save.message}`}</Alert>}
    </AreaForm>
  );
}
