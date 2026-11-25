import type { InboxRow, Unread, UnreadState } from "../../unread/index.ts";
import { inboxRows, rowKey, rowsOf } from "../../board/index.ts";
import { useMemo, useSyncExternalStore } from "react";
import type { InboxItem } from "../../sdk/index.ts";
import type { InboxSelection } from "../../paths/index.ts";
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
  readonly rows: readonly InboxRow[];
  readonly kept: readonly InboxItem[];
  readonly me: string;
  readonly selected: InboxSelection | null;
}

function heldOf({ kept, me, rows, selected }: Holding): InboxRow | null {
  if (rows.some((row) => isSelected({ row, selected }))) {
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
  return useMemo(() => shownWith(rows, heldOf({ kept, me, rows, selected })), [kept, me, rows, selected]);
}

function heldKey(rows: InboxRows): string | null {
  if (rows.held === null) {
    return null;
  }
  return rows.held.key;
}

export { type InboxRows, heldKey, isSelected, useInboxRows };
