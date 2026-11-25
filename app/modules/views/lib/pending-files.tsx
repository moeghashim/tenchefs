import { useCallback, useContext, useSyncExternalStore } from "react";
import { LandingContext } from "../../landing/index.ts";
import type { PendingAttachments } from "../../composer/index.ts";
import { PendingFile } from "./pending-file.tsx";
import { PendingList } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { removedFocus } from "./removed-focus.ts";

const TEXT = { pending: "Files to send" } as const;
const NONE = 0;

interface PendingFilesProps {
  readonly attachments: PendingAttachments;
  readonly form: string;
}

export function PendingFiles(props: PendingFilesProps): ReactNode {
  const { attachments, form } = props;
  const { attachments: pending } = useSyncExternalStore(attachments.subscribe, attachments.snapshot);
  const { watch } = useContext(LandingContext);
  const handleRemove = useCallback(
    (key: number) => {
      watch(removedFocus({ form, key, pending: attachments.snapshot().attachments }));
      attachments.remove(key);
    },
    [attachments, form, watch],
  );
  if (pending.length === NONE) {
    return null;
  }
  return (
    <PendingList label={TEXT.pending}>
      {pending.map((attachment) => (
        <PendingFile attachment={attachment} key={attachment.key} onRemove={handleRemove} />
      ))}
    </PendingList>
  );
}
