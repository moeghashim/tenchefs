import { Alert } from "../../design-system/content.tsx";
import type { MessageMenu } from "../../unread/index.ts";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

interface MarkUnreadRefusalProps {
  readonly menu: MessageMenu;
}

export function MarkUnreadRefusal(props: MarkUnreadRefusalProps): ReactNode {
  const { menu } = props;
  const refusal = useSyncExternalStore(menu.subscribe, menu.refusal);
  if (refusal === null) {
    return null;
  }
  return <Alert>{`Couldn't mark the message unread (${refusal.code}): ${refusal.message}`}</Alert>;
}
