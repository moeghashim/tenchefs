import { Array as Arr, Effect, Option, Predicate } from "effect";
import type {
  DeactivatedQuietAgent,
  DeactivationOffer,
  InboxHistoryItem,
  InboxHistoryNudge,
  InboxHistoryResponse,
  InboxItem,
  InboxResponse,
  Nudge,
  NudgeResponse,
  OfflineAlert,
} from "../../index.ts";
import type { Storage, StorageUnavailable, StoredNudge } from "../../../storage/server.ts";
import { isNudgeId, nudgeTexts } from "../../index.ts";
import {
  itemsWithReactions,
  reactionItemFor,
  reactionItems,
  withHistoryReactions,
  withReactionItems,
} from "./reaction-items.ts";
import type { DeactivationOffers } from "./deactivation-offers.ts";
import type { Identity } from "../../../identities/index.ts";
import type { MessageId } from "../../../messages/index.ts";
import type { OfflineAlerts } from "./offline-alerts.ts";
import type { Refusal } from "../../../http/index.ts";
import { agentJoinRequestsOn } from "./agent-join-requests.ts";
import { echoed } from "../../../http/index.ts";
import { pageSize } from "../../../messages/index.ts";
import { unread } from "./offline-alerts.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

type Store = Storage["Service"];

type Channel = InboxItem["channel"];

type JoinRequestCalls = ReturnType<typeof agentJoinRequestsOn>;

type StoredItem = Omit<InboxItem, "channel">;

type StoredHistoryItem = Omit<InboxHistoryItem, "channel">;

interface HistoryQuery {
  readonly before?: MessageId;
  readonly limit?: number;
}

interface HistoryPage {
  readonly before?: MessageId;
  readonly limit: number;
}

interface Asking {
  readonly storage: Store;
  readonly caller: Identity;
}

interface Listing {
  readonly storage: Store;
  readonly offlineAlerts: OfflineAlerts["Service"];
  readonly deactivationOffers: DeactivationOffers["Service"];
}

interface ListingCalls {
  readonly inbox: (caller: Identity) => Fails<InboxResponse>;
  readonly history: (caller: Identity, query: HistoryQuery) => Fails<InboxHistoryResponse>;
  readonly itemFor: (caller: Identity, id: MessageId) => Fails<readonly InboxItem[]>;
  readonly itemsAfter: (caller: Identity, id: MessageId) => Fails<readonly InboxItem[]>;
  readonly reactionItemFor: (caller: Identity, id: MessageId) => Fails<readonly InboxItem[]>;
  readonly reactionItems: (caller: Identity) => Fails<readonly InboxItem[]>;
  readonly markNudgeRead: (caller: Identity, asked: string) => Fails<NudgeResponse>;
  readonly agentJoinRequestsAfterChange: JoinRequestCalls["agentJoinRequestsAfterChange"];
}

const NOT_FOUND = 404;

function nudgeNotFound(asked: string): Refusal {
  return { code: "nudge_not_found", message: `You have no nudge ${echoed(asked)}.`, status: NOT_FOUND };
}

function withChannel<Item extends StoredItem>(
  channels: readonly Channel[],
  item: Item,
): readonly (Item & { readonly channel: Channel })[] {
  const channel = Arr.findFirst(channels, (listed) => listed.name === item.message.channel);
  return Option.toArray(Option.map(channel, (listed) => ({ ...item, channel: listed })));
}

function withChannels<Item extends StoredItem>(
  storage: Store,
  items: readonly Item[],
): Fails<readonly (Item & { readonly channel: Channel })[]> {
  return Effect.zipWith(itemsWithReactions({ items, storage }), storage.listChannels(), (counted, channels) =>
    Arr.flatMap(counted, (item) => withChannel(channels, item)),
  );
}

function historyNudgeIn(channels: readonly Channel[]): (stored: StoredNudge) => readonly InboxHistoryNudge[] {
  return ({ id, kind, parent, raisedAt, read }) =>
    Option.toArray(
      Option.map(
        Arr.findFirst(channels, (channel) => channel.name === parent.channel),
        (channel) => ({ channel, id, kind, parent, raisedAt, read, text: nudgeTexts[kind] }),
      ),
    );
}

function withoutRead({ read: _read, ...nudge }: InboxHistoryNudge): Nudge {
  return nudge;
}

interface Showing {
  readonly storage: Store;
  readonly stored: readonly StoredNudge[];
}

function shownNudges({ storage, stored }: Showing): Effect.Effect<readonly InboxHistoryNudge[], StorageUnavailable> {
  if (!Arr.isReadonlyArrayNonEmpty(stored)) {
    return Effect.succeed([]);
  }
  return Effect.map(storage.listChannels(), (channels) => Arr.flatMap(stored, historyNudgeIn(channels)));
}

function historyPage({ before, limit = pageSize.default }: HistoryQuery): HistoryPage {
  if (Predicate.isUndefined(before)) {
    return { limit };
  }
  return { before, limit };
}

function nudgesOnPage({ caller, storage }: Asking, query: HistoryQuery): Fails<readonly InboxHistoryNudge[]> {
  if (Predicate.isNotUndefined(query.before)) {
    return Effect.succeed([]);
  }
  return Effect.flatMap(storage.listNudges(caller.name, "all"), (stored) =>
    shownNudges({ storage, stored: Arr.reverse(stored) }),
  );
}

function alertsOnPage(
  { caller, offlineAlerts }: Listing & Asking,
  query: HistoryQuery,
): Fails<readonly OfflineAlert[]> {
  if (Predicate.isNotUndefined(query.before)) {
    return Effect.succeed([]);
  }
  return Effect.map(offlineAlerts.list(caller), Arr.reverse);
}

function offersOnPage(
  { caller, deactivationOffers }: Listing & Asking,
  query: HistoryQuery,
): Fails<readonly DeactivationOffer[]> {
  if (Predicate.isNotUndefined(query.before)) {
    return Effect.succeed([]);
  }
  return Effect.map(deactivationOffers.list(caller, "all"), Arr.reverse);
}

function deactivatedQuietAgentsOnPage(
  { caller, deactivationOffers }: Listing & Asking,
  query: HistoryQuery,
): Fails<readonly DeactivatedQuietAgent[]> {
  if (Predicate.isNotUndefined(query.before)) {
    return Effect.succeed([]);
  }
  return Effect.map(deactivationOffers.listDeactivatedQuietAgents(caller, "all"), Arr.reverse);
}

function historyOf(asking: Listing & Asking, query: HistoryQuery): Fails<InboxHistoryResponse> {
  const { caller, storage } = asking;
  return Effect.gen(function* inboxHistory() {
    const { hasMore, items } = yield* storage.listInboxHistory(caller.name, historyPage(query));
    const reacted = yield* withHistoryReactions({ author: caller.name, items, storage });
    const listed = yield* withChannels<StoredHistoryItem>(storage, reacted);
    const alerts = yield* alertsOnPage(asking, query);
    const nudges = yield* nudgesOnPage(asking, query);
    const deactivationOffers = yield* offersOnPage(asking, query);
    const deactivatedQuietAgents = yield* deactivatedQuietAgentsOnPage(asking, query);
    return { alerts, deactivatedQuietAgents, deactivationOffers, hasMore, items: listed, nudges };
  });
}

function unreadNudges({ caller, storage }: Asking): Fails<readonly Nudge[]> {
  return Effect.flatMap(storage.listNudges(caller.name, "unread"), (stored) =>
    Effect.map(shownNudges({ storage, stored }), Arr.map(withoutRead)),
  );
}

function inboxOf(asking: Listing & Asking & Pick<JoinRequestCalls, "agentJoinRequests">): Fails<InboxResponse> {
  const { agentJoinRequests: pendingFor, caller, deactivationOffers: offers, offlineAlerts, storage } = asking;
  return Effect.gen(function* inboxWithAlertsAndNudges() {
    const stored = yield* storage.listInbox(caller.name);
    const withReactions = yield* withReactionItems({ author: caller.name, items: stored, storage });
    const items = yield* withChannels(storage, withReactions);
    const alerts = yield* offlineAlerts.list(caller);
    const nudges = yield* unreadNudges(asking);
    const deactivationOffers = yield* offers.list(caller, "open");
    const deactivatedQuietAgents = yield* offers.listDeactivatedQuietAgents(caller, "unread");
    const agentJoinRequests = yield* pendingFor(caller);
    return { agentJoinRequests, alerts: unread(alerts), deactivatedQuietAgents, deactivationOffers, items, nudges };
  });
}

function markedNudge({ caller, storage }: Asking, asked: string): Fails<StoredNudge | null> {
  const id = Number(asked);
  if (!isNudgeId(id)) {
    return Effect.succeed(null);
  }
  return storage.markNudgeRead(caller.name, id);
}

function markNudgeRead({ caller, storage }: Asking, asked: string): Fails<NudgeResponse> {
  return Effect.gen(function* markRead() {
    const marked = yield* markedNudge({ caller, storage }, asked);
    const [nudge] = yield* shownNudges({ storage, stored: Arr.fromNullishOr(marked) });
    if (Predicate.isUndefined(nudge)) {
      return yield* Effect.fail(nudgeNotFound(asked));
    }
    return { nudge };
  });
}

function listingOn(listing: Listing): ListingCalls {
  const { storage } = listing;
  const { agentJoinRequests, agentJoinRequestsAfterChange } = agentJoinRequestsOn(storage);
  return {
    agentJoinRequestsAfterChange,
    history: (caller, query) => historyOf({ ...listing, caller }, query),
    inbox: (caller) => inboxOf({ ...listing, agentJoinRequests, caller }),
    itemFor: (caller, id) =>
      Effect.flatMap(storage.findInboxItem(caller.name, id), (stored) =>
        withChannels(storage, Arr.fromNullishOr(stored)),
      ),
    itemsAfter: (caller, id) =>
      Effect.flatMap(storage.listInboxAfter(caller.name, id), (stored) => withChannels(storage, stored)),
    markNudgeRead: (caller, asked) => markNudgeRead({ caller, storage }, asked),
    reactionItemFor: (caller, id) =>
      Effect.flatMap(reactionItemFor({ author: caller.name, id, storage }), (stored) => withChannels(storage, stored)),
    reactionItems: (caller) =>
      Effect.flatMap(reactionItems({ author: caller.name, storage }), (stored) => withChannels(storage, stored)),
  };
}

export { listingOn, shownNudges };
