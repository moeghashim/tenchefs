import { AttachmentItem, AttachmentList } from "../../design-system/messages.tsx";
import { AttachmentView } from "./attachment-view.tsx";
import type { Message } from "../../sdk/index.ts";
import type { ReactNode } from "react";

const TEXT = { attachments: "Attachments" } as const;
const NONE = 0;

interface MessageAttachmentsProps {
  readonly message: Message;
  readonly linked: boolean;
}

export function MessageAttachments(props: MessageAttachmentsProps): ReactNode {
  const { attachments = [] } = props.message;
  if (attachments.length === NONE) {
    return null;
  }
  return (
    <AttachmentList label={TEXT.attachments}>
      {attachments.map((attachment) => (
        <AttachmentItem key={attachment.id}>
          <AttachmentView attachment={attachment} linked={props.linked} />
        </AttachmentItem>
      ))}
    </AttachmentList>
  );
}
