import type { InboxRow, Unread, UnreadState } from "../../unread/index.ts";
import { inboxRows, rowKey, rowsOf, threadOf } from "../../board/index.ts";
import { useMemo, useSyncExternalStore } from "react";
import type { BoardState } from "../../board/index.ts";
import type { InboxItem } from "../../sdk/index.ts";
import type { InboxSelection } from "../../paths/index.ts";
import { isThreadDeleted } from "./thread-deleted.ts";
import { useBoardInbox } from "./use-board-inbox.ts";

interface InboxRows {
  readonly rows: readonly InboxRow[];
  readonly held: InboxRow | null;
}

interface RowsOf {
  readonly unread: Unread;
  readonly state: UnreadState;
  readonly me: string;
  readonly selected: InboxSelection | null;
}

interface Choice {
  readonly row: InboxRow;
  readonly selected: InboxSelection | null;
}

function isSelected({ row, selected }: Choice): boolean {
  return selected !== null && row.key === rowKey(selected) && row.latest.channel.name === selected.channel;
}

interface Holding {
  readonly gone: boolean;
  readonly rows: readonly InboxRow[];
  readonly kept: readonly InboxItem[];
  readonly me: string;
  readonly selected: InboxSelection | null;
}

function isGone(state: BoardState, selected: InboxSelection | null): boolean {
  if (selected === null) {
    return false;
  }
  const { channel, thread } = selected;
  if (thread === null) {
    return false;
  }
  return isThreadDeleted(threadOf({ channel, id: thread })(state));
}

function heldOf({ gone, kept, me, rows, selected }: Holding): InboxRow | null {
  if (gone || rows.some((row) => isSelected({ row, selected }))) {
    return null;
  }
  return rowsOf({ items: kept, me }).find((row) => isSelected({ row, selected })) ?? null;
}

function shownWith(rows: readonly InboxRow[], held: InboxRow | null): InboxRows {
  if (held === null) {
    return { held, rows };
  }
  return {
    held,
    rows: [...rows, held].toSorted((first, second) => second.latest.message.id - first.latest.message.id),
  };
}

function useInboxRows({ me, selected, unread }: RowsOf): InboxRows {
  const selection = unread.selection(selected);
  const { items: kept } = useSyncExternalStore(selection.subscribe, selection.snapshot);
  const rows = useBoardInbox((state) => inboxRows({ me, state }));
  const gone = useBoardInbox((state) => isGone(state, selected));
  return useMemo(() => shownWith(rows, heldOf({ gone, kept, me, rows, selected })), [gone, kept, me, rows, selected]);
}

function heldKey(rows: InboxRows): string | null {
  if (rows.held === null) {
    return null;
  }
  return rows.held.key;
}

export { type InboxRows, heldKey, isSelected, useInboxRows };
