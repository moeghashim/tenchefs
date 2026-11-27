import type { ComponentProps, ReactNode } from "react";
import type { Unread, UnreadState } from "../../unread/index.ts";
import { InboxFeed } from "./inbox-feed.tsx";
import { InboxHeader } from "./inbox-header.tsx";
import type { InboxRows } from "./use-inbox-rows.ts";
import type { InboxSelection } from "../../paths/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import { ListPane } from "../../design-system/layout.tsx";
import { useBoardStore } from "./use-board.ts";
import { useMemo } from "react";

const TITLE = "Inbox";

interface InboxListProps {
  readonly unread: Unread;
  readonly keymap: Keymap;
  readonly state: UnreadState;
  readonly rows: InboxRows;
  readonly me: string;
  readonly selected: InboxSelection | null;
  readonly notices: ComponentProps<typeof InboxFeed>["notices"];
}

export function InboxList(props: InboxListProps): ReactNode {
  const { me, rows, selected, state: unread } = props;
  const { ack } = useBoardStore().calls;
  const { markUnread } = props.unread;
  const { shortcutOf } = props.keymap;
  const actions = useMemo(() => ({ ack, markUnread, shortcutOf }), [ack, markUnread, shortcutOf]);
  return (
    <ListPane hiddenWhenNarrow={selected !== null}>
      <InboxHeader state={unread} title={TITLE} unread={props.unread} />
      <InboxFeed
        actions={actions}
        label={TITLE}
        me={me}
        notices={props.notices}
        rows={rows}
        selected={selected}
        state={unread}
        unread={props.unread}
      />
    </ListPane>
  );
}
