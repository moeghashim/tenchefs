import type { FeedPart, Fold } from "./closed-folds.ts";
import type { MessageId, TopLevelMessage } from "../../sdk/index.ts";
import type { StreamRow } from "./stream-rows.ts";
import { foldClosed } from "./closed-folds.ts";
import { streamRows } from "./stream-rows.ts";

const FIRST = 0;
const ONE = 1;

type FeedRow =
  | { readonly kind: "fold"; readonly fold: Fold; readonly day: string | null }
  | { readonly kind: "message"; readonly row: StreamRow };

interface FeedOf {
  readonly messages: readonly TopLevelMessage[];
  readonly expanded: ReadonlyMap<MessageId, number>;
  readonly held: ReadonlySet<MessageId>;
  readonly readPosition: number | null;
  readonly me: string;
}

function brokenAt(row: StreamRow, afterFold: ReadonlySet<MessageId>): StreamRow {
  if (!afterFold.has(row.message.id)) {
    return row;
  }
  return { ...row, grouped: false };
}

function dayOf(row: FeedRow): string | null {
  if (row.kind === "fold") {
    return row.day;
  }
  return row.row.day;
}

function isFold(row: FeedRow | null): boolean {
  if (row === null) {
    return false;
  }
  return row.kind === "fold";
}

function dayMerged(rows: readonly FeedRow[]): readonly FeedRow[] {
  const before: readonly (FeedRow | null)[] = [null, ...rows];
  const days = rows.map((row) => dayOf(row));
  return rows.map((row, index) => {
    if (row.kind === "fold") {
      return { ...row, day: days[index + ONE] ?? null };
    }
    if (isFold(before[index] ?? null)) {
      return { ...row, row: { ...row.row, day: null } };
    }
    return row;
  });
}

function feedRows(feed: FeedOf): readonly FeedRow[] {
  const parts: readonly FeedPart[] = foldClosed(feed);
  const shown = parts.filter((part) => part.kind === "message");
  const afterFold = new Set(shown.filter((part) => part.afterFold).map((part) => part.message.id));
  const rows = streamRows({ ...feed, after: null, messages: shown.map((part) => part.message) });
  let next = FIRST;
  const ordered = parts.flatMap((part): readonly FeedRow[] => {
    if (part.kind === "fold") {
      return [{ day: null, fold: part, kind: "fold" }];
    }
    const row = rows.slice(next, next + ONE);
    next += ONE;
    return row.map((each) => ({ kind: "message", row: brokenAt(each, afterFold) }));
  });
  return dayMerged(ordered);
}

export { feedRows };
