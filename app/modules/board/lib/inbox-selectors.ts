import type {
  ChannelName,
  DeactivatedQuietAgent,
  DeactivatedQuietAgentId,
  DeactivationOffer,
  InboxAgentJoinRequest,
  InboxHistoryNudge,
  InboxItem,
  MessageId,
  Nudge,
  OfflineAlert,
  Refusal,
} from "../../sdk/index.ts";
import type { InboxEntries, Loaded } from "./inbox-entries.ts";
import { itemsNewestFirst, keptOn } from "./inbox-joined.ts";
import { movesBackAt, readPositionAt } from "./read-positions-slice.ts";
import type { Failure } from "./failure.ts";
import type { InboxHeld } from "./inbox-part.ts";
import type { MarkAllState } from "./inbox-calls.ts";
import type { MessagesHeld } from "./messages-table.ts";

type InboxShown =
  | { readonly status: "loading" }
  | {
      readonly status: "loaded";
      readonly items: readonly InboxItem[];
      readonly alerts: readonly OfflineAlert[];
      readonly nudges: readonly Nudge[];
      readonly deactivationOffers: readonly DeactivationOffer[];
      readonly deactivatedQuietAgents: readonly DeactivatedQuietAgent[];
      readonly heldDeactivatedQuietAgents: readonly DeactivatedQuietAgent[];
      readonly agentJoinRequests: readonly InboxAgentJoinRequest[];
      readonly markAll: MarkAllState;
    }
  | Failure;

type MoreShown = { readonly status: "idle" } | { readonly status: "loading" } | Failure;

type EarlierShown =
  | { readonly status: "loading" }
  | {
      readonly status: "loaded";
      readonly items: readonly InboxItem[];
      readonly hasMore: boolean;
      readonly pageSize: number;
      readonly more: MoreShown;
    }
  | Failure;

type HistoryShown<Shown> = { readonly status: "loading" } | Shown | { readonly status: "failed" };

type AlertsShown = HistoryShown<{ readonly status: "loaded"; readonly alerts: readonly OfflineAlert[] }>;

type NudgesShown = HistoryShown<{ readonly status: "loaded"; readonly nudges: readonly InboxHistoryNudge[] }>;

type OffersShown = HistoryShown<{
  readonly status: "loaded";
  readonly deactivationOffers: readonly DeactivationOffer[];
}>;

type QuietAgentsShown = HistoryShown<{
  readonly status: "loaded";
  readonly deactivatedQuietAgents: readonly DeactivatedQuietAgent[];
  readonly held: readonly DeactivatedQuietAgentId[];
}>;

interface JoinsShown {
  readonly refused: ReadonlyMap<string, Refusal>;
}

const LOADING = { status: "loading" } as const;
const FAILED = { status: "failed" } as const;

function newestFirst<Id extends number, Entry extends { readonly id: Id }>(
  held: ReadonlyMap<Id, Entry>,
): readonly Entry[] {
  return [...held.values()].toSorted((first, second) => second.id - first.id);
}

function withoutRead({ read: _read, ...nudge }: InboxHistoryNudge): Nudge {
  return nudge;
}

function quietOf(
  entries: InboxEntries,
): Pick<Extract<InboxShown, { readonly status: "loaded" }>, "deactivatedQuietAgents" | "heldDeactivatedQuietAgents"> {
  const all = newestFirst(entries.deactivatedQuietAgents);
  return {
    deactivatedQuietAgents: all.filter(({ read }) => !read),
    heldDeactivatedQuietAgents: all.filter(({ id, read }) => read && entries.held.has(id)),
  };
}

function loadedOf(entries: InboxEntries, markAll: MarkAllState, items: readonly InboxItem[]): InboxShown {
  return {
    ...quietOf(entries),
    agentJoinRequests: entries.agentJoinRequests,
    alerts: newestFirst(entries.alerts).filter(({ read }) => !read),
    deactivationOffers: newestFirst(entries.deactivationOffers).filter(({ cleared }) => !cleared),
    items: items.toReversed(),
    markAll,
    nudges: newestFirst(entries.nudges)
      .filter(({ read }) => !read)
      .map((nudge) => withoutRead(nudge)),
    status: "loaded",
  };
}

const inboxShown = keptOn((entries: InboxEntries, markAll: MarkAllState, items: readonly InboxItem[]): InboxShown => {
  if (entries.inbox.status === "loaded") {
    return loadedOf(entries, markAll, items);
  }
  return entries.inbox;
});

type InboxShowing = InboxHeld & { readonly messages: MessagesHeld };

function inboxOf(state: InboxShowing): InboxShown {
  const { entries } = state.inbox;
  return inboxShown(
    entries,
    state.inboxCalls.markAll,
    itemsNewestFirst({ held: entries.items, table: state.messages.table }),
  );
}

const earlierShown = keptOn(
  (earlier: InboxEntries["earlier"], pageSize: number, items: readonly InboxItem[]): EarlierShown => {
    if (earlier.status.status !== "loaded") {
      return earlier.status;
    }
    const { hasMore, more } = earlier;
    return { hasMore, items, more, pageSize, status: "loaded" };
  },
);

function earlierOf(state: InboxShowing): EarlierShown {
  const { earlier } = state.inbox.entries;
  return earlierShown(
    earlier,
    state.inboxPageSize,
    itemsNewestFirst({ held: earlier.read, table: state.messages.table }),
  );
}

function historyOf<Shown>(history: Loaded, loaded: () => Shown): HistoryShown<Shown> {
  if (history.status === "loaded") {
    return loaded();
  }
  if (history.status === "loading") {
    return LOADING;
  }
  return FAILED;
}

const alertsShown = keptOn(
  (alerts: InboxEntries["alerts"], history: Loaded): AlertsShown =>
    historyOf(history, () => ({ alerts: newestFirst(alerts), status: "loaded" as const })),
);

function alertsOf(state: InboxHeld): AlertsShown {
  return alertsShown(state.inbox.entries.alerts, state.inbox.entries.history);
}

const nudgesShown = keptOn(
  (nudges: InboxEntries["nudges"], history: Loaded): NudgesShown =>
    historyOf(history, () => ({ nudges: newestFirst(nudges), status: "loaded" as const })),
);

function nudgesOf(state: InboxHeld): NudgesShown {
  return nudgesShown(state.inbox.entries.nudges, state.inbox.entries.history);
}

const offersShown = keptOn(
  (offers: InboxEntries["deactivationOffers"], history: Loaded): OffersShown =>
    historyOf(history, () => ({ deactivationOffers: newestFirst(offers), status: "loaded" as const })),
);

function offersOf(state: InboxHeld): OffersShown {
  return offersShown(state.inbox.entries.deactivationOffers, state.inbox.entries.history);
}

const quietShown = keptOn(
  (entries: InboxEntries, history: Loaded): QuietAgentsShown =>
    historyOf(history, () => ({
      deactivatedQuietAgents: newestFirst(entries.deactivatedQuietAgents),
      held: [...entries.held],
      status: "loaded" as const,
    })),
);

function quietAgentsOf(state: InboxHeld): QuietAgentsShown {
  return quietShown(state.inbox.entries, state.inbox.entries.history);
}

const joinsShown = keptOn((refused: InboxEntries["refusedJoins"], _none: null): JoinsShown => ({ refused }));

function joinRefusalsOf(state: InboxHeld): JoinsShown {
  return joinsShown(state.inbox.entries.refusedJoins, null);
}

interface InboxPlace {
  readonly state: InboxHeld;
  readonly channel: ChannelName;
  readonly thread: MessageId | null;
}

function inboxReadPosition({ channel, state, thread }: InboxPlace): MessageId | null {
  return readPositionAt({ place: { channel, thread }, positions: state.inbox.readPositions });
}

function inboxMovesBack({ channel, state, thread }: InboxPlace): number {
  return movesBackAt({ place: { channel, thread }, positions: state.inbox.readPositions });
}

export {
  type AlertsShown,
  type EarlierShown,
  type InboxShowing,
  type InboxShown,
  type JoinsShown,
  type NudgesShown,
  type OffersShown,
  type QuietAgentsShown,
  alertsOf,
  earlierOf,
  inboxMovesBack,
  inboxOf,
  inboxReadPosition,
  joinRefusalsOf,
  nudgesOf,
  offersOf,
  quietAgentsOf,
};
