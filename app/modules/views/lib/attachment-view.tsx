import { AttachmentImage, FileChip, ImageThumbnail } from "../../design-system/messages.tsx";
import { assetUrl, imageBoxOf, readableSize } from "./attachment-text.ts";
import type { Attachment } from "../../sdk/index.ts";
import type { ReactNode } from "react";

interface AttachmentViewProps {
  readonly attachment: Attachment;
  readonly linked: boolean;
}

function hrefOf({ attachment, linked }: AttachmentViewProps): string | null {
  if (!linked) {
    return null;
  }
  return assetUrl(attachment);
}

export function AttachmentView(props: AttachmentViewProps): ReactNode {
  const { attachment } = props;
  const detail = readableSize(attachment.size);
  if (!attachment.image) {
    return <FileChip detail={detail} href={hrefOf(props)} name={attachment.name} />;
  }
  if (!props.linked) {
    return <AttachmentImage name={attachment.name} size={imageBoxOf(attachment)} small src={assetUrl(attachment)} />;
  }
  return (
    <ImageThumbnail detail={detail} name={attachment.name} size={imageBoxOf(attachment)} src={assetUrl(attachment)} />
  );
}
