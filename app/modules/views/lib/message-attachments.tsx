import type { Attachment, Message } from "../../sdk/index.ts";
import { imagesOf, shownImageOf } from "./attachment-text.ts";
import { AttachmentItems } from "./attachment-items.tsx";
import { ImageCarousel } from "../../design-system/messages.tsx";
import type { ReactNode } from "react";
import { useMemo } from "react";

const NONE = 0;
const NO_ATTACHMENTS: readonly Attachment[] = [];

interface MessageAttachmentsProps {
  readonly message: Message;
  readonly linked: boolean;
}

export function MessageAttachments(props: MessageAttachmentsProps): ReactNode {
  const { attachments = NO_ATTACHMENTS } = props.message;
  const images = useMemo(() => imagesOf(attachments), [attachments]);
  const shown = useMemo(() => images.map((image) => shownImageOf(image)), [images]);
  if (attachments.length === NONE) {
    return null;
  }
  return (
    <ImageCarousel images={shown}>
      <AttachmentItems attachments={attachments} images={images} linked={props.linked} />
    </ImageCarousel>
  );
}
