import { ItemRow, Muted } from "../../design-system/content.tsx";
import { alertTextOf, backTextOf } from "./alert-text.ts";
import type { OfflineAlert } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { useTimeAgo } from "./use-time-ago.ts";

interface AlertRowProps {
  readonly alert: OfflineAlert;
  readonly children?: ReactNode;
}

export function AlertRow(props: AlertRowProps): ReactNode {
  const { alert } = props;
  const raised = useTimeAgo(alert.raisedAt);
  const back = useTimeAgo(alert.backOnlineAt ?? alert.raisedAt);
  return (
    <ItemRow>
      <span className="text-sm">{alertTextOf(alert)}</span>
      <Muted>{`${raised} · ${backTextOf({ ago: back, alert })}`}</Muted>
      {props.children}
    </ItemRow>
  );
}
