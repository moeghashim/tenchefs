import type { ComponentProps, ReactNode } from "react";
import type { Unread, UnreadState } from "../../unread/index.ts";
import { Feed } from "../../design-system/feed.tsx";
import { InboxBody } from "./inbox-body.tsx";
import { InboxEarlier } from "./inbox-earlier.tsx";
import type { InboxRows } from "./use-inbox-rows.ts";
import type { InboxSelection } from "../../paths/index.ts";
import { MarkAllFailed } from "./mark-all-failed.tsx";

type InboxBodyProps = ComponentProps<typeof InboxBody>;

interface InboxFeedProps {
  readonly label: string;
  readonly unread: Unread;
  readonly state: UnreadState;
  readonly rows: InboxRows;
  readonly me: string;
  readonly selected: InboxSelection | null;
  readonly actions: InboxBodyProps["actions"];
  readonly notices: InboxBodyProps["notices"];
}

export function InboxFeed(props: InboxFeedProps): ReactNode {
  const { me, rows, selected, state } = props;
  const handleMarkAlertRead = props.unread.alerts.markRead;
  return (
    <Feed label={props.label}>
      {state.status === "loaded" && <MarkAllFailed markAll={state.markAll} />}
      <InboxBody
        actions={props.actions}
        me={me}
        notices={props.notices}
        onMarkAlertRead={handleMarkAlertRead}
        rows={rows}
        selected={selected}
        unread={state}
      />
      {state.status === "loaded" && (
        <InboxEarlier
          identities={props.notices.identities}
          me={me}
          rows={rows}
          selected={selected}
          unread={props.unread}
        />
      )}
    </Feed>
  );
}
