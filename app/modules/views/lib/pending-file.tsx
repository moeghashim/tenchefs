import { AttachmentImage, FileChip } from "../../design-system/messages.tsx";
import { useCallback, useMemo } from "react";
import type { PendingAttachment } from "../../composer/index.ts";
import { PendingItem } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { readableSize } from "./attachment-text.ts";

interface PendingFileProps {
  readonly attachment: PendingAttachment;
  readonly onRemove: (key: number) => void;
}

export function PendingFile(props: PendingFileProps): ReactNode {
  const { attachment, onRemove } = props;
  const handleRemove = useCallback(() => {
    onRemove(attachment.key);
  }, [attachment.key, onRemove]);
  const removeLabel = useMemo(() => `Remove ${attachment.name}`, [attachment.name]);
  return (
    <PendingItem onRemove={handleRemove} removeLabel={removeLabel}>
      {attachment.preview !== null && (
        <AttachmentImage name={attachment.name} size={null} small src={attachment.preview} />
      )}
      {attachment.preview === null && (
        <FileChip detail={readableSize(attachment.size)} href={null} name={attachment.name} />
      )}
    </PendingItem>
  );
}
