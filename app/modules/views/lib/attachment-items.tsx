import { AttachmentItem, AttachmentList } from "../../design-system/messages.tsx";
import type { Attachment } from "../../sdk/index.ts";
import { AttachmentView } from "./attachment-view.tsx";
import type { ReactNode } from "react";

const TEXT = { attachments: "Attachments" } as const;

interface AttachmentItemsProps {
  readonly attachments: readonly Attachment[];
  readonly images: readonly Attachment[];
  readonly linked: boolean;
}

export function AttachmentItems(props: AttachmentItemsProps): ReactNode {
  const { images } = props;
  return (
    <AttachmentList label={TEXT.attachments}>
      {props.attachments.map((attachment) => (
        <AttachmentItem key={attachment.id}>
          <AttachmentView at={images.indexOf(attachment)} attachment={attachment} linked={props.linked} />
        </AttachmentItem>
      ))}
    </AttachmentList>
  );
}
