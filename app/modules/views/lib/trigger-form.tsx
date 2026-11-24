import {
  Alert,
  ButtonRow,
  Form,
  InputField,
  QuietButton,
  SubmitButton,
  TextField,
} from "../../design-system/index.tsx";
import type { TriggerSettings, TriggerSnapshot } from "../../composer/index.ts";
import type { IdentityName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { TriggerResultLine } from "./trigger-result-line.tsx";
import { savedUrl } from "../../composer/index.ts";
import { useSyncExternalStore } from "react";

const TEXT = {
  clear: "Clear",
  help: "Each mention of the agent POSTs { text } here, with the token as a bearer. https only.",
  save: "Save trigger URL",
  token: "Token (write-only: never shown again)",
  url: "Trigger URL",
} as const;

interface TriggerFormProps {
  readonly name: IdentityName;
  readonly settings: TriggerSettings;
}

function hasTrigger({ loaded }: TriggerSnapshot): boolean {
  return loaded.status === "loaded" && loaded.trigger !== null;
}

export function TriggerForm(props: TriggerFormProps): ReactNode {
  const { settings } = props;
  const state = useSyncExternalStore(settings.subscribe, settings.snapshot);
  const handleEditUrl = settings.editUrl;
  const handleSave = settings.save;
  const handleClear = settings.clear;
  const saving = state.save.status === "saving";
  return (
    <Form field="token" label={`${TEXT.url} for @${props.name}`} onSubmit={handleSave}>
      <InputField
        error={null}
        help={TEXT.help}
        kind="text"
        label={TEXT.url}
        onEdit={handleEditUrl}
        required
        value={state.url ?? savedUrl(state.loaded)}
      />
      <TextField label={TEXT.token} name="token" />
      <ButtonRow>
        <SubmitButton disabled={saving}>{TEXT.save}</SubmitButton>
        {hasTrigger(state) && (
          <QuietButton disabled={saving} onClick={handleClear}>
            {TEXT.clear}
          </QuietButton>
        )}
      </ButtonRow>
      <TriggerResultLine loaded={state.loaded} />
      {state.save.status === "failed" && (
        <Alert>{`Couldn't save the trigger URL (${state.save.code}): ${state.save.message}`}</Alert>
      )}
    </Form>
  );
}
