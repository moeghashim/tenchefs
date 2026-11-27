import { callDataOf, fieldsOf, promptOf, shownCall, typedIn } from "./prompt-fields.ts";
import { useCallback, useMemo } from "react";
import { CallRefusal } from "./call-refusal.tsx";
import type { CallState } from "../../board/index.ts";
import { PromptForm } from "../../design-system/controls.tsx";
import type { PromptKeys } from "./use-prompt-keys.ts";
import type { ReactNode } from "react";
import type { WebhookCommand } from "../../webhook-commands/index.ts";
import type { WebhookCommandCalls } from "./use-board.ts";
import { WebhookCommandFields } from "./webhook-command-fields.tsx";
import { usePromptKeys } from "./use-prompt-keys.ts";

const TEXT = { button: "Call", calling: "Calling…" } as const;

interface WebhookCommandPromptProps {
  readonly webhookCommand: WebhookCommand;
  readonly calls: WebhookCommandCalls;
  readonly call: CallState;
  readonly callData: string;
  readonly keymap: PromptKeys["keymap"];
  readonly onBack: () => void;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

export function WebhookCommandPrompt(props: WebhookCommandPromptProps): ReactNode {
  const { callData, calls, webhookCommand: command, onCancel, onDone } = props;
  const { call, editCallData } = calls;
  const { fields, prompt } = useMemo(() => {
    const asked = promptOf(command.schema);
    return { fields: fieldsOf(asked), prompt: asked };
  }, [command.schema]);
  const typed = useMemo(() => typedIn(callData), [callData]);
  const handleEdit = useCallback(
    (name: string, value: string | boolean) => {
      editCallData(JSON.stringify({ ...typed, [name]: value }));
    },
    [editCallData, typed],
  );
  const handleSubmit = useCallback(() => {
    const data = callDataOf({ kept: callData, prompt, typed });
    call({ called: onDone, data, refused: null, webhookCommand: command.name });
  }, [call, callData, command.name, onDone, prompt, typed]);
  const handleCancel = useCallback(() => {
    editCallData("");
    onCancel();
  }, [editCallData, onCancel]);
  const label = usePromptKeys({ keymap: props.keymap, label: `Call /${command.name}`, onEscape: props.onBack });
  const shown = shownCall({ call: props.call, webhookCommand: command.name });
  return (
    <PromptForm
      busy={shown.status === "calling"}
      busyButton={TEXT.calling}
      button={TEXT.button}
      description={command.description ?? null}
      label={label}
      onCancel={handleCancel}
      onSubmit={handleSubmit}
      title={`/${command.name}`}
    >
      <WebhookCommandFields
        call={shown}
        fields={fields}
        kept={callData}
        onEdit={handleEdit}
        onEditData={editCallData}
        prompt={prompt}
        typed={typed}
      />
      <CallRefusal call={shown} fields={fields} />
    </PromptForm>
  );
}
