import { Button } from "../../design-system/controls.tsx";
import type { Identities } from "../../composer/index.ts";
import { Notice } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = { dismiss: "Dismiss" } as const;

interface IdentityDeletedNoticeProps {
  readonly identities: Identities;
}

export function IdentityDeletedNotice(props: IdentityDeletedNoticeProps): ReactNode {
  const { deletion } = props.identities;
  const notice = useSyncExternalStore(deletion.subscribe, deletion.snapshot);
  const handleDismiss = deletion.dismiss;
  if (notice === null) {
    return null;
  }
  return (
    <Notice>
      <span>{`@${notice} was deleted, so its profile closed.`}</span>
      <Button onClick={handleDismiss}>{TEXT.dismiss}</Button>
    </Notice>
  );
}
