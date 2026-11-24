import type { ComponentProps, ReactNode } from "react";
import { Feed, ListPane } from "../../design-system/index.tsx";
import type { Unread, UnreadState } from "../../unread/index.ts";
import type { Board } from "../../board/index.ts";
import { InboxBody } from "./inbox-body.tsx";
import { InboxEarlier } from "./inbox-earlier.tsx";
import { InboxHeader } from "./inbox-header.tsx";
import type { InboxRows } from "./use-inbox-rows.ts";
import type { InboxSelection } from "../../paths/index.ts";
import { MarkAllFailed } from "./mark-all-failed.tsx";
import { useMemo } from "react";

const TITLE = "Inbox";

interface InboxListProps {
  readonly board: Board;
  readonly unread: Unread;
  readonly state: UnreadState;
  readonly rows: InboxRows;
  readonly me: string;
  readonly selected: InboxSelection | null;
  readonly notices: ComponentProps<typeof InboxBody>["notices"];
}

export function InboxList(props: InboxListProps): ReactNode {
  const { me, rows, selected, state: unread } = props;
  const handleMarkAlertRead = props.unread.alerts.markRead;
  const { ack } = props.board;
  const { markUnread } = props.unread;
  const actions = useMemo(() => ({ ack, markUnread }), [ack, markUnread]);
  return (
    <ListPane hiddenWhenNarrow={selected !== null}>
      <InboxHeader board={props.board} state={unread} title={TITLE} unread={props.unread} />
      <Feed label={TITLE}>
        {unread.status === "loaded" && <MarkAllFailed markAll={unread.markAll} />}
        <InboxBody
          actions={actions}
          me={me}
          notices={props.notices}
          onMarkAlertRead={handleMarkAlertRead}
          rows={rows}
          selected={selected}
          unread={unread}
        />
        {unread.status === "loaded" && (
          <InboxEarlier
            identities={props.notices.identities}
            me={me}
            rows={rows}
            selected={selected}
            unread={props.unread}
          />
        )}
      </Feed>
    </ListPane>
  );
}
