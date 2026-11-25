import type {
  DeactivatedQuietAgent,
  DeactivationOffer,
  InboxHistoryNudge,
  InboxHistoryResponse,
  InboxResponse,
  Nudge,
  ReadPosition,
} from "../../sdk/index.ts";
import type { InboxEntries, InboxState } from "./inbox-entries.ts";
import { behindOnServer, movedBack, movedOn } from "./read-positions-slice.ts";
import { earlierApplied, withItems, withRead } from "./inbox-items-applied.ts";
import { withAll, withPart } from "./inbox-entries.ts";
import { withPending } from "./inbox-notices-applied.ts";

const LOADED = { status: "loaded" } as const;

function clearedOffer(offer: DeactivationOffer): DeactivationOffer {
  return { ...offer, cleared: true };
}

function readQuietAgent(entry: DeactivatedQuietAgent): DeactivatedQuietAgent {
  return { ...entry, read: true };
}

function unreadNudge(nudge: Nudge): InboxHistoryNudge {
  return { ...nudge, read: false };
}

function offersOpenAre(entries: InboxEntries, open: readonly DeactivationOffer[]): InboxEntries {
  const listed = new Set(open.map(({ id }) => id));
  const gone = [...entries.deactivationOffers.values()].filter(({ cleared, id }) => !cleared && !listed.has(id));
  const offers = [...gone.map((offer) => clearedOffer(offer)), ...open];
  return withPart({
    entries,
    key: "deactivationOffers",
    value: withAll({ entries: offers, held: entries.deactivationOffers }),
  });
}

function quietUnreadAre(entries: InboxEntries, unread: readonly DeactivatedQuietAgent[]): InboxEntries {
  const listed = new Set(unread.map(({ id }) => id));
  const gone = [...entries.deactivatedQuietAgents.values()].filter(({ id, read }) => !read && !listed.has(id));
  const quiet = [...gone.map((entry) => readQuietAgent(entry)), ...unread];
  const value = withAll({ entries: quiet, held: entries.deactivatedQuietAgents });
  return withPart({ entries, key: "deactivatedQuietAgents", value });
}

function withInboxNotices(entries: InboxEntries, inbox: InboxResponse): InboxEntries {
  const alerts = withPart({ entries, key: "alerts", value: withAll({ entries: inbox.alerts, held: entries.alerts }) });
  const unread = inbox.nudges.map((nudge) => unreadNudge(nudge));
  const nudged = withPart({ entries: alerts, key: "nudges", value: withAll({ entries: unread, held: alerts.nudges }) });
  const offered = offersOpenAre(nudged, inbox.deactivationOffers);
  return withPending({
    entries: quietUnreadAre(offered, inbox.deactivatedQuietAgents),
    pending: inbox.agentJoinRequests,
  });
}

interface Caught {
  readonly state: InboxState;
  readonly inbox: InboxResponse;
  readonly server: readonly ReadPosition[];
}

function withMovesBack(state: InboxState, server: readonly ReadPosition[]): InboxState {
  let { entries, readPositions } = state;
  for (const position of behindOnServer({ held: state.readPositions, server })) {
    readPositions = movedBack({ position, positions: readPositions });
    const change = { readPosition: position, type: "read-position-moved-back" } as const;
    entries = earlierApplied({ change, entries, positions: readPositions });
  }
  return { entries, readPositions };
}

function withInbox({ inbox, server, state }: Caught): InboxState {
  const moved = withMovesBack(state, server);
  const positions = movedOn({ all: server, positions: moved.readPositions });
  const read = withRead({ acked: [], entries: moved.entries, positions });
  const items = withItems({ entries: read, items: inbox.items, positions });
  return { entries: { ...withInboxNotices(items, inbox), inbox: LOADED }, readPositions: positions };
}

interface Paged {
  readonly entries: InboxEntries;
  readonly history: InboxHistoryResponse;
}

function withHistoryNotices({ entries, history }: Paged): InboxEntries {
  const alerts = withPart({
    entries,
    key: "alerts",
    value: withAll({ entries: history.alerts, held: entries.alerts }),
  });
  const nudges = withPart({
    entries: alerts,
    key: "nudges",
    value: withAll({ entries: history.nudges, held: alerts.nudges }),
  });
  const offers = withPart({
    entries: nudges,
    key: "deactivationOffers",
    value: withAll({ entries: history.deactivationOffers, held: nudges.deactivationOffers }),
  });
  const quiet = withAll({ entries: history.deactivatedQuietAgents, held: offers.deactivatedQuietAgents });
  return { ...withPart({ entries: offers, key: "deactivatedQuietAgents", value: quiet }), history: LOADED };
}

export { LOADED, withHistoryNotices, withInbox };
