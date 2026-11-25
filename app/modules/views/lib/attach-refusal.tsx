import { Alert } from "../../design-system/content.tsx";
import type { PendingAttachments } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

interface AttachRefusalProps {
  readonly attachments: PendingAttachments;
}

export function AttachRefusal(props: AttachRefusalProps): ReactNode {
  const { attachments } = props;
  const { refusal } = useSyncExternalStore(attachments.subscribe, attachments.snapshot);
  if (refusal === null) {
    return null;
  }
  return <Alert>{`Couldn't attach ${refusal.name} (${refusal.code}): ${refusal.message}`}</Alert>;
}
