import { FeedHeading, FeedList } from "../../design-system/feed.tsx";
import type { OfflineAlert, OfflineAlertId } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { UnreadAlertRow } from "./unread-alert-row.tsx";

const NONE = 0;
const TITLE = "Agents offline";

interface InboxAlertsProps {
  readonly alerts: readonly OfflineAlert[];
  readonly onMarkRead: (id: OfflineAlertId) => void;
}

export function InboxAlerts(props: InboxAlertsProps): ReactNode {
  const { alerts, onMarkRead } = props;
  return (
    alerts.length > NONE && (
      <>
        <FeedHeading count={alerts.length} title={TITLE} />
        <FeedList label={TITLE}>
          {alerts.map((alert) => (
            <UnreadAlertRow alert={alert} key={alert.id} onMarkRead={onMarkRead} />
          ))}
        </FeedList>
      </>
    )
  );
}
