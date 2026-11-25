import type { OfflineAlertId } from "../../sdk/index.ts";
import { QuietButton } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { useCallback } from "react";

const TEXT = { markRead: "Mark read" } as const;

interface AlertReadButtonProps {
  readonly id: OfflineAlertId;
  readonly onMarkRead: (id: OfflineAlertId) => void;
}

export function AlertReadButton(props: AlertReadButtonProps): ReactNode {
  const { id, onMarkRead } = props;
  const handleClick = useCallback(() => {
    onMarkRead(id);
  }, [id, onMarkRead]);
  return <QuietButton onClick={handleClick}>{TEXT.markRead}</QuietButton>;
}
