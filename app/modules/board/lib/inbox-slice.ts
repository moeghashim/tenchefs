import type { Applying, Change, InboxChange, InboxEntries, InboxState } from "./inbox-entries.ts";
import { NO_READ_POSITIONS, movedOn, readPositionsApplied } from "./read-positions-slice.ts";
import { earlierApplied, itemsApplied } from "./inbox-items-applied.ts";
import { joinsApplied, nudgesApplied, offersApplied, quietAgentsApplied } from "./inbox-notices-applied.ts";
import type { CookoutEvent } from "../../sdk/index.ts";
import type { InboxReading } from "./inbox-read.ts";
import { NO_ENTRIES } from "./inbox-entries.ts";
import type { ReadPositions } from "./read-positions-slice.ts";
import type { Slice } from "./slice.ts";
import { inboxRead } from "./inbox-read.ts";

const INBOX_CHANGES: ReadonlySet<string> = new Set<InboxChange["type"]>([
  "agent-join-answered",
  "earlier-more",
  "earlier-page",
  "inbox-acked-all",
  "inbox-read-again",
  "positions-read",
  "quiet-agent-held",
]);

const NO_INBOX: InboxState = { entries: NO_ENTRIES, readPositions: NO_READ_POSITIONS };

const APPLIED: readonly ((applying: Applying) => InboxEntries)[] = [
  itemsApplied,
  earlierApplied,
  nudgesApplied,
  offersApplied,
  quietAgentsApplied,
  joinsApplied,
];

function isEvent(change: Change): change is CookoutEvent {
  return !INBOX_CHANGES.has(change.type);
}

function positionsChanged(positions: ReadPositions, change: Change): ReadPositions {
  if (isEvent(change)) {
    return readPositionsApplied({ event: change, positions });
  }
  if (change.type === "positions-read" || change.type === "inbox-acked-all") {
    return movedOn({ all: change.readPositions, positions });
  }
  return positions;
}

function entriesApplied(applying: Applying): InboxEntries {
  let { entries } = applying;
  for (const apply of APPLIED) {
    entries = apply({ ...applying, entries });
  }
  return entries;
}

function inboxApplied(state: InboxState, change: Change): InboxState {
  const readPositions = positionsChanged(state.readPositions, change);
  const entries = entriesApplied({ change, entries: state.entries, positions: readPositions });
  if (readPositions === state.readPositions && entries === state.entries) {
    return state;
  }
  return { entries, readPositions };
}

const inboxSlice: Slice<InboxState, InboxReading, Change> = {
  apply: inboxApplied,
  empty: NO_INBOX,
  read: async (reading, held) => {
    const read = await inboxRead({ held, reading });
    return read;
  },
};

export { inboxSlice };
