import type { ChannelCreation, ChannelCreationSnapshot, CreationState } from "../../board/index.ts";
import { InputField, PromptForm } from "../../design-system/controls.tsx";
import { useCallback, useContext } from "react";
import type { ChannelName } from "../../sdk/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import { LandingContext } from "../../landing/index.ts";
import type { ReactNode } from "react";
import { hrefOf } from "../../paths/index.ts";
import { usePromptKeys } from "./use-prompt-keys.ts";

const TEXT = {
  busy: "Creating…",
  button: "Create",
  description: "Description",
  descriptionHelp: "What the channel is for, up to 500 characters.",
  name: "Name",
  nameHelp: "Lowercase letters, digits or '-', up to 80.",
  title: "New channel",
} as const;

interface NewChannelFormProps {
  readonly creation: ChannelCreation;
  readonly keymap: Keymap;
  readonly state: ChannelCreationSnapshot;
}

function errorOn(create: CreationState, field: "name" | "description"): string | null {
  if (create.status !== "failed" || create.field !== field) {
    return null;
  }
  return `Couldn't create the channel (${create.code}): ${create.message}`;
}

export function NewChannelForm(props: NewChannelFormProps): ReactNode {
  const { creation, state } = props;
  const handleCancel = creation.close;
  const handleEditName = creation.editName;
  const handleEditDescription = creation.editDescription;
  const land = useContext(LandingContext).ask;
  const handleSubmit = useCallback(() => {
    creation.create((channel: ChannelName) => {
      globalThis.location.hash = hrefOf({ channel, name: "channel" });
      land();
    });
  }, [creation, land]);
  usePromptKeys({ keymap: props.keymap, label: TEXT.title, onEscape: handleCancel });
  return (
    <PromptForm
      busy={state.create.status === "creating"}
      busyButton={TEXT.busy}
      button={TEXT.button}
      description={null}
      label={TEXT.title}
      onCancel={handleCancel}
      onSubmit={handleSubmit}
      title={TEXT.title}
    >
      <InputField
        error={errorOn(state.create, "name")}
        help={TEXT.nameHelp}
        kind="text"
        label={TEXT.name}
        onEdit={handleEditName}
        required
        value={state.name}
      />
      <InputField
        error={errorOn(state.create, "description")}
        help={TEXT.descriptionHelp}
        kind="text"
        label={TEXT.description}
        onEdit={handleEditDescription}
        required={false}
        value={state.description}
      />
    </PromptForm>
  );
}
