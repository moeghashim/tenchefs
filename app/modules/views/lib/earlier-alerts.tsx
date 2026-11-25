import type { Alerts, AlertsState } from "../../unread/index.ts";
import { AlertRow } from "./alert-row.tsx";
import { FeedList } from "../../design-system/feed.tsx";
import type { OfflineAlert } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const NONE = 0;
const LABEL = "Earlier offline alerts";

interface EarlierAlertsProps {
  readonly alerts: Alerts;
}

function readOf(state: AlertsState): readonly OfflineAlert[] {
  if (state.status !== "loaded") {
    return [];
  }
  return state.alerts.filter(({ read }) => read);
}

export function EarlierAlerts(props: EarlierAlertsProps): ReactNode {
  const state = useSyncExternalStore(props.alerts.subscribe, props.alerts.snapshot);
  const read = readOf(state);
  return (
    read.length > NONE && (
      <FeedList label={LABEL}>
        {read.map((alert) => (
          <AlertRow alert={alert} key={alert.id} />
        ))}
      </FeedList>
    )
  );
}
