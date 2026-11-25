import type { ChannelName, Command } from "../../sdk/index.ts";
import { callDataOf, fieldsOf, promptOf, shownCall, typedIn } from "./prompt-fields.ts";
import { useCallback, useMemo } from "react";
import { CallRefusal } from "./call-refusal.tsx";
import type { CallState } from "../../board/index.ts";
import { CommandFields } from "./command-fields.tsx";
import { PromptForm } from "../../design-system/controls.tsx";
import type { PromptKeys } from "./use-prompt-keys.ts";
import type { ReactNode } from "react";
import { useChannelCalls } from "./use-board.ts";
import { usePromptKeys } from "./use-prompt-keys.ts";

const TEXT = { button: "Call", calling: "Calling…" } as const;

interface CommandPromptProps {
  readonly command: Command;
  readonly channel: ChannelName;
  readonly call: CallState;
  readonly callData: string;
  readonly keymap: PromptKeys["keymap"];
  readonly onBack: () => void;
  readonly onDone: () => void;
}

export function CommandPrompt(props: CommandPromptProps): ReactNode {
  const { callData, channel, command, onDone } = props;
  const { call, editCallData } = useChannelCalls(channel);
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
    call(command.name, callDataOf({ kept: callData, prompt, typed }), onDone);
  }, [call, callData, command.name, onDone, prompt, typed]);
  const handleCancel = useCallback(() => {
    editCallData("");
    onDone();
  }, [editCallData, onDone]);
  const label = usePromptKeys({ keymap: props.keymap, label: `Call /${command.name}`, onEscape: props.onBack });
  const shown = shownCall({ call: props.call, command: command.name });
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
      <CommandFields
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
