import { FeedList, FeedNote } from "../../design-system/feed.tsx";
import { earlierEntries, readAlertsOf } from "./earlier-order.ts";
import { useMemo, useSyncExternalStore } from "react";
import type { Alerts } from "../../unread/index.ts";
import { EarlierEntryView } from "./earlier-entry.tsx";
import type { InboxItem } from "../../sdk/index.ts";
import type { InboxSelection } from "../../paths/index.ts";
import type { ReactNode } from "react";
import { rowsOf } from "../../unread/index.ts";

const NONE = 0;
const EMPTY = "Nothing read yet.";

interface EarlierItemsProps {
  readonly items: readonly InboxItem[];
  readonly alerts: Alerts;
  readonly hasMore: boolean;
  readonly label: string;
  readonly me: string;
  readonly hidden: string | null;
  readonly selected: InboxSelection | null;
}

export function EarlierItems(props: EarlierItemsProps): ReactNode {
  const { hidden, items, me, selected } = props;
  const alertsState = useSyncExternalStore(props.alerts.subscribe, props.alerts.snapshot);
  const alerts = useMemo(() => readAlertsOf(alertsState), [alertsState]);
  const all = useMemo(() => rowsOf({ items, me }), [items, me]);
  const entries = useMemo(
    () => earlierEntries({ alerts, rows: all.filter((row) => row.key !== hidden) }),
    [alerts, all, hidden],
  );
  return (
    <>
      {all.length === NONE && !props.hasMore && <FeedNote place="empty">{EMPTY}</FeedNote>}
      {entries.length > NONE && (
        <FeedList label={props.label}>
          {entries.map((entry) => (
            <EarlierEntryView entry={entry} key={entry.key} me={me} selected={selected} />
          ))}
        </FeedList>
      )}
    </>
  );
}
