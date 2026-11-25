import type {
  AckAllRequest,
  AckAllResponse,
  AckRequest,
  AckResponse,
  DeactivatedQuietAgentResponse,
  DeactivationOfferResponse,
  FollowResponse,
  InboxHistoryResponse,
  InboxItem,
  InboxResponse,
  MarkUnreadResponse,
  MovedBackReadPosition,
  NudgeResponse,
  OfflineAlertResponse,
  ReadPositionsResponse,
  SubscriptionResponse,
} from "../../index.ts";
import type { Acked, Fails, Hub, NudgesRead } from "./acks.ts";
import { Context, Effect, Layer, PubSub } from "effect";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import { acksOn, orMessageNotFound } from "./acks.ts";
import { following, subscription } from "./subscriptions.ts";
import { DeactivationOffers } from "./deactivation-offers.ts";
import { OfflineAlerts } from "./offline-alerts.ts";
import { ReadReceipts } from "../../../messages/server.ts";
import type { Scope } from "effect";
import { Storage } from "../../../storage/server.ts";
import type { SubscriptionChanged } from "./subscriptions.ts";
import { listingOn } from "./listing.ts";

interface HistoryQuery {
  readonly before?: MessageId;
  readonly limit?: number;
}

type MessageId = AckRequest["messageId"];

interface MovedBack {
  readonly identity: IdentityName;
  readonly readPosition: MovedBackReadPosition;
}

interface Hubs {
  readonly acked: Hub<Acked>;
  readonly nudgesRead: Hub<NudgesRead>;
  readonly readReceipts: ReadReceipts["Service"];
  readonly movedBack: Hub<MovedBack>;
  readonly subscriptions: Hub<SubscriptionChanged>;
  readonly offlineAlerts: OfflineAlerts["Service"];
  readonly deactivationOffers: DeactivationOffers["Service"];
}

interface InboxService {
  readonly inbox: (caller: Identity) => Fails<InboxResponse>;
  readonly history: (caller: Identity, query: HistoryQuery) => Fails<InboxHistoryResponse>;
  readonly itemFor: (caller: Identity, id: MessageId) => Fails<readonly InboxItem[]>;
  readonly itemsAfter: (caller: Identity, id: MessageId) => Fails<readonly InboxItem[]>;
  readonly reactionItemFor: (caller: Identity, id: MessageId) => Fails<readonly InboxItem[]>;
  readonly reactionItems: (caller: Identity) => Fails<readonly InboxItem[]>;
  readonly ack: (caller: Identity, id: MessageId) => Fails<AckResponse>;
  readonly ackAll: (caller: Identity, request: AckAllRequest) => Fails<AckAllResponse>;
  readonly markAlertRead: (caller: Identity, asked: string) => Fails<OfflineAlertResponse>;
  readonly markNudgeRead: (caller: Identity, asked: string) => Fails<NudgeResponse>;
  readonly keepDeactivationOffer: (caller: Identity, asked: string) => Fails<DeactivationOfferResponse>;
  readonly markDeactivatedQuietAgentRead: (caller: Identity, asked: string) => Fails<DeactivatedQuietAgentResponse>;
  readonly readPositions: (caller: Identity) => Fails<ReadPositionsResponse>;
  readonly agentJoinRequestsAfterChange: ReturnType<typeof listingOn>["agentJoinRequestsAfterChange"];
  readonly acked: Effect.Effect<PubSub.Subscription<Acked>, never, Scope.Scope>;
  readonly markUnread: (caller: Identity, id: MessageId) => Fails<MarkUnreadResponse>;
  readonly movedBack: Effect.Effect<PubSub.Subscription<MovedBack>, never, Scope.Scope>;
  readonly nudgesRead: Effect.Effect<PubSub.Subscription<NudgesRead>, never, Scope.Scope>;
  readonly subscriptionChanged: Effect.Effect<PubSub.Subscription<SubscriptionChanged>, never, Scope.Scope>;
  readonly follow: (caller: Identity, asked: string) => Fails<FollowResponse>;
  readonly unfollow: (caller: Identity, asked: string) => Fails<FollowResponse>;
  readonly subscribe: (caller: Identity, channel: string) => Fails<SubscriptionResponse>;
  readonly unsubscribe: (caller: Identity, channel: string) => Fails<SubscriptionResponse>;
}

class Inbox extends Context.Service<Inbox, InboxService>()("@ai-hero/cookout/inbox/lib/server/service/Inbox") {}

interface InboxOn {
  readonly storage: Storage["Service"];
  readonly hubs: Hubs;
}

function inboxOn(on: InboxOn): InboxService {
  const { hubs, storage } = on;
  const { acked: hub, deactivationOffers, movedBack, nudgesRead, offlineAlerts, subscriptions } = hubs;
  const listing = listingOn({ deactivationOffers, offlineAlerts, storage });
  return {
    ...acksOn(on),
    ...listing,
    acked: hub.subscribe,
    follow: following({ change: storage.followThread, isFollowing: true }),
    keepDeactivationOffer: deactivationOffers.keep,
    markAlertRead: (caller, asked) => Effect.map(offlineAlerts.markRead(caller, asked), (alert) => ({ alert })),
    markDeactivatedQuietAgentRead: deactivationOffers.markDeactivatedQuietAgentRead,
    markNudgeRead: (caller, asked) =>
      Effect.tap(listing.markNudgeRead(caller, asked), ({ nudge }) =>
        nudgesRead.publish({ nudgeIds: [nudge.id], recipient: caller.name }),
      ),
    markUnread: (caller, id) =>
      Effect.gen(function* markUnread() {
        const moved = yield* storage.moveReadPositionBack(caller.name, id);
        const readPosition = yield* orMessageNotFound<MovedBackReadPosition>(String(id))(moved);
        yield* movedBack.publish({ identity: caller.name, readPosition });
        return { readPosition };
      }),
    movedBack: movedBack.subscribe,
    nudgesRead: nudgesRead.subscribe,
    readPositions: (caller) =>
      Effect.map(storage.listReadPositions(caller.name), (readPositions) => ({ readPositions })),
    subscribe: subscription({ change: storage.subscribeChannel, hub: subscriptions, subscribed: true }),
    subscriptionChanged: subscriptions.subscribe,
    unfollow: following({ change: storage.unfollowThread, isFollowing: false }),
    unsubscribe: subscription({ change: storage.unsubscribeChannel, hub: subscriptions, subscribed: false }),
  };
}

function hubOf<Value>(): Effect.Effect<Hub<Value>> {
  return Effect.gen(function* openHub() {
    const pubSub = yield* PubSub.unbounded<Value>();
    return { publish: (value: Value) => PubSub.publish(pubSub, value), subscribe: PubSub.subscribe(pubSub) };
  });
}

const inboxLayer: Layer.Layer<Inbox, never, Storage | ReadReceipts | OfflineAlerts | DeactivationOffers> = Layer.effect(
  Inbox,
  Effect.gen(function* inboxOnStorage() {
    const storage = yield* Storage;
    const readReceipts = yield* ReadReceipts;
    const offlineAlerts = yield* OfflineAlerts;
    const deactivationOffers = yield* DeactivationOffers;
    const acked = yield* hubOf<Acked>();
    const movedBack = yield* hubOf<MovedBack>();
    const nudgesRead = yield* hubOf<NudgesRead>();
    const subscriptions = yield* hubOf<SubscriptionChanged>();
    return inboxOn({
      hubs: { acked, deactivationOffers, movedBack, nudgesRead, offlineAlerts, readReceipts, subscriptions },
      storage,
    });
  }),
);

export { Inbox, inboxLayer };
