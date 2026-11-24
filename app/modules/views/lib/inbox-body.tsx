import { Alert, FeedNote, Skeleton } from "../../design-system/index.tsx";
import type { ComponentProps, ReactNode } from "react";
import { ForYouNotices } from "./for-you-notices.tsx";
import { InboxAlerts } from "./inbox-alerts.tsx";
import type { InboxRows } from "./use-inbox-rows.ts";
import { InboxSection } from "./inbox-section.tsx";
import type { InboxSelection } from "../../paths/index.ts";
import type { NoticeActions } from "./for-you-notices.tsx";
import type { OfflineAlertId } from "../../sdk/index.ts";
import type { UnreadState } from "../../unread/index.ts";
import { besideCountOf } from "./beside-count.ts";

const NONE = 0;

const TEXT = { activity: "Activity", empty: "You're all caught up.", forYou: "For you" } as const;

interface InboxBodyProps {
  readonly actions: ComponentProps<typeof InboxSection>["actions"];
  readonly unread: UnreadState;
  readonly me: string;
  readonly rows: InboxRows;
  readonly selected: InboxSelection | null;
  readonly onMarkAlertRead: (id: OfflineAlertId) => void;
  readonly notices: NoticeActions;
}

export function InboxBody(props: InboxBodyProps): ReactNode {
  const { me, rows, selected, unread } = props;
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
      <InboxSection
        actions={props.actions}
        besides={unread.nudges.length + unread.deactivationOffers.length + unread.deactivatedQuietAgents.length}
        forYou
        uncounted={held}
        me={me}
        rows={rows}
        selected={selected}
        title={TEXT.forYou}
      >
        <ForYouNotices
          actions={props.notices}
          deactivated={unread.deactivatedQuietAgents}
          held={unread.heldDeactivatedQuietAgents}
          nudges={unread.nudges}
          offers={unread.deactivationOffers}
        />
      </InboxSection>
      <InboxSection
        actions={props.actions}
        besides={NONE}
        forYou={false}
        me={me}
        rows={rows}
        selected={selected}
        title={TEXT.activity}
        uncounted={NONE}
      />
    </>
  );
}
