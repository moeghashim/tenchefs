import { AttachButton, Form, SendButton } from "../../design-system/controls.tsx";
import { useCallback, useContext, useSyncExternalStore } from "react";
import type { Draft } from "../../composer/index.ts";
import { DraftText } from "./draft-text.tsx";
import { MessageKeys } from "../../design-system/messages.tsx";
import type { Outgoing } from "../../board/index.ts";
import { PendingFiles } from "./pending-files.tsx";
import type { ReactNode } from "react";

const SEND = { posting: "Sending…", ready: "Send" } as const;
const ATTACH = "Attach files";
const NONE = 0;

interface MessageFormText {
  readonly field: string;
  readonly form: string;
}

interface MessageFormProps {
  readonly draft: Draft;
  readonly posting: boolean;
  readonly onPost: (outgoing: Outgoing, posted: () => void) => void;
  readonly text: MessageFormText;
  readonly focused: boolean;
}

function sendLabelOf(posting: boolean): string {
  if (posting) {
    return SEND.posting;
  }
  return SEND.ready;
}

export function MessageForm(props: MessageFormProps): ReactNode {
  const { draft, onPost, posting } = props;
  const { attachments } = draft;
  const handleFiles = attachments.attach;
  const { attach } = useContext(MessageKeys);
  const pending = useSyncExternalStore(attachments.subscribe, attachments.snapshot);
  const handleSend = useCallback(
    (sent: string) => {
      onPost({ files: attachments.snapshot().attachments, text: sent }, draft.clear);
    },
    [attachments, draft, onPost],
  );
  return (
    <Form field="text" label={props.text.form} onSubmit={handleSend}>
      <PendingFiles attachments={attachments} form={props.text.form} />
      <DraftText
        draft={draft}
        focused={props.focused}
        label={props.text.field}
        required={pending.attachments.length === NONE}
      />
      <AttachButton keys={attach} label={ATTACH} onFiles={handleFiles} />
      <SendButton disabled={posting} label={sendLabelOf(posting)} />
    </Form>
  );
}
