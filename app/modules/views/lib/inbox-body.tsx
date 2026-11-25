import { Alert, Skeleton } from "../../design-system/content.tsx";
import type { ComponentProps, ReactNode } from "react";
import { FeedNote } from "../../design-system/feed.tsx";
import { InboxAlerts } from "./inbox-alerts.tsx";
import { InboxSections } from "./inbox-sections.tsx";
import type { OfflineAlertId } from "../../sdk/index.ts";
import type { UnreadState } from "../../unread/index.ts";
import { besideCountOf } from "./beside-count.ts";

const NONE = 0;

const TEXT = { empty: "You're all caught up." } as const;

type SectionsProps = ComponentProps<typeof InboxSections>;

interface InboxBodyProps {
  readonly actions: SectionsProps["actions"];
  readonly unread: UnreadState;
  readonly me: string;
  readonly rows: SectionsProps["rows"];
  readonly selected: SectionsProps["selected"];
  readonly onMarkAlertRead: (id: OfflineAlertId) => void;
  readonly notices: SectionsProps["notices"];
}

export function InboxBody(props: InboxBodyProps): ReactNode {
  const { unread } = props;
  if (unread.status === "loading") {
    return (
      <>
        <Skeleton width="short" />
        <Skeleton width="long" />
      </>
    );
  }
  if (unread.status === "failed") {
    return <Alert>{`Couldn't load the inbox (${unread.code}): ${unread.message}`}</Alert>;
  }
  const held = unread.heldDeactivatedQuietAgents.length;
  return (
    <>
      {unread.items.length + besideCountOf(unread) + held === NONE && <FeedNote place="empty">{TEXT.empty}</FeedNote>}
      <InboxAlerts alerts={unread.alerts} onMarkRead={props.onMarkAlertRead} />
      <InboxSections
        actions={props.actions}
        besides={besideCountOf(unread) - unread.alerts.length}
        me={props.me}
        notices={props.notices}
        rows={props.rows}
        selected={props.selected}
        unread={unread}
      />
    </>
  );
}
