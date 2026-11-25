import { InputField, LineForm } from "../../design-system/controls.tsx";
import type { AgentCreation } from "../../composer/index.ts";
import { Alert } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = {
  displayName: "Its display name",
  displayNameHelp: "The name shown beside its @name, such as 'Triage bot'. A new agent needs one.",
  field: "New agent's name",
  label: "Create an agent",
  submit: "Create",
} as const;

interface CreateAgentFormProps {
  readonly creation: AgentCreation;
}

export function CreateAgentForm(props: CreateAgentFormProps): ReactNode {
  const { creation } = props;
  const state = useSyncExternalStore(creation.subscribe, creation.snapshot);
  const handleEdit = creation.edit;
  const handleEditDisplayName = creation.editDisplayName;
  const handleCreate = creation.create;
  const { create } = state;
  return (
    <LineForm
      field={TEXT.field}
      label={TEXT.label}
      onEdit={handleEdit}
      onSubmit={handleCreate}
      saving={create.status === "creating"}
      submit={TEXT.submit}
      submitLast
      value={state.text}
    >
      <InputField
        error={null}
        help={TEXT.displayNameHelp}
        kind="text"
        label={TEXT.displayName}
        onEdit={handleEditDisplayName}
        required
        value={state.displayName}
      />
      {create.status === "failed" && <Alert>{`Couldn't create the agent (${create.code}): ${create.message}`}</Alert>}
    </LineForm>
  );
}
