/**
 * The inbox on the backend: the `Inbox` service over `Storage`, and the
 * routes that read the caller's inbox, a page of its inbox history and its read positions, ack a message or the whole
 * inbox, mark a message unread or a Nudge read, follow and unfollow a
 * thread, answer Keep on a Deactivation offer, mark an entry about a deactivated quiet agent read, and subscribe to
 * and unsubscribe from a channel. Each read position an ack moves is also
 * published to an in-process hub, which `acked` subscribes to, for live
 * updates. Routes sit
 * behind the server's token gate.
 */
import {
  AckAllRequestSchema,
  AckAllResponseSchema,
  AckRequestSchema,
  AckResponseSchema,
  DeactivatedQuietAgentResponseSchema,
  DeactivationOfferResponseSchema,
  FollowResponseSchema,
  InboxHistoryQuerySchema,
  InboxHistoryResponseSchema,
  InboxResponseSchema,
  MarkUnreadRequestSchema,
  MarkUnreadResponseSchema,
  NudgeResponseSchema,
  OfflineAlertResponseSchema,
  ReadPositionsResponseSchema,
  SubscriptionResponseSchema,
} from "./lib/server/wire.ts";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import {
  ackAllPath,
  ackPath,
  deactivatedQuietAgentReadPath,
  deactivationOfferKeepPath,
  followPath,
  inboxHistoryPath,
  inboxPath,
  markUnreadPath,
  nudgeReadPath,
  offlineAlertReadPath,
  readPositionsPath,
  subscriptionPath,
} from "./index.ts";
import { Caller } from "../identities/server.ts";
import { Effect } from "effect";
import { Inbox } from "./lib/server/service.ts";
import type { Route } from "../http/server.ts";

type Needs = Caller | Inbox;

type Change = "PUT" | "DELETE";

const ALL_ERRORS = { errors: "all" } as const;
const DIGITS = /^\d+$/u;
const PATH_BASE = "http://cookout.invalid";

const inboxRoute: Route<Needs> = {
  handle: () =>
    Effect.gen(function* inboxRouteHandler() {
      const caller = yield* Caller;
      const inbox = yield* Inbox;
      const answer = yield* inbox.inbox(caller);
      return yield* HttpServerResponse.schemaJson(InboxResponseSchema)(answer);
    }),
  method: "GET",
  path: inboxPath,
};

const historyRoute: Route<Needs> = {
  handle: () =>
    Effect.gen(function* inboxHistoryRouteHandler() {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const search = HttpServerRequest.searchParamsFromURL(new URL(request.url, PATH_BASE));
      const query = yield* HttpServerRequest.schemaSearchParams(InboxHistoryQuerySchema, ALL_ERRORS).pipe(
        Effect.provideService(HttpServerRequest.ParsedSearchParams, search),
      );
      const caller = yield* Caller;
      const inbox = yield* Inbox;
      const answer = yield* inbox.history(caller, query);
      return yield* HttpServerResponse.schemaJson(InboxHistoryResponseSchema)(answer);
    }),
  method: "GET",
  path: inboxHistoryPath,
};

const readPositionsRoute: Route<Needs> = {
  handle: () =>
    Effect.gen(function* readPositionsRouteHandler() {
      const caller = yield* Caller;
      const inbox = yield* Inbox;
      const answer = yield* inbox.readPositions(caller);
      return yield* HttpServerResponse.schemaJson(ReadPositionsResponseSchema)(answer);
    }),
  method: "GET",
  path: readPositionsPath,
};

const ackRoute: Route<Needs> = {
  handle: () =>
    Effect.gen(function* ackRouteHandler() {
      const { messageId } = yield* HttpServerRequest.schemaBodyJson(AckRequestSchema, ALL_ERRORS);
      const caller = yield* Caller;
      const inbox = yield* Inbox;
      const answer = yield* inbox.ack(caller, messageId);
      return yield* HttpServerResponse.schemaJson(AckResponseSchema)(answer);
    }),
  method: "POST",
  path: ackPath,
};

const ackAllRoute: Route<Needs> = {
  handle: () =>
    Effect.gen(function* ackAllRouteHandler() {
      const asked = yield* HttpServerRequest.schemaBodyJson(AckAllRequestSchema, ALL_ERRORS);
      const caller = yield* Caller;
      const inbox = yield* Inbox;
      const answer = yield* inbox.ackAll(caller, asked);
      return yield* HttpServerResponse.schemaJson(AckAllResponseSchema)(answer);
    }),
  method: "POST",
  path: ackAllPath,
};

const markUnreadRoute: Route<Needs> = {
  handle: () =>
    Effect.gen(function* markUnreadRouteHandler() {
      const { messageId } = yield* HttpServerRequest.schemaBodyJson(MarkUnreadRequestSchema, ALL_ERRORS);
      const caller = yield* Caller;
      const inbox = yield* Inbox;
      const answer = yield* inbox.markUnread(caller, messageId);
      return yield* HttpServerResponse.schemaJson(MarkUnreadResponseSchema)(answer);
    }),
  method: "POST",
  path: markUnreadPath,
};

const alertReadRoute: Route<Needs> = {
  handle: (params) =>
    Effect.gen(function* alertReadRouteHandler() {
      const caller = yield* Caller;
      const inbox = yield* Inbox;
      const answer = yield* inbox.markAlertRead(caller, String(params["id"]));
      return yield* HttpServerResponse.schemaJson(OfflineAlertResponseSchema)(answer);
    }),
  method: "POST",
  path: offlineAlertReadPath,
};

const nudgeReadRoute: Route<Needs> = {
  handle: (params) =>
    Effect.gen(function* nudgeReadRouteHandler() {
      const caller = yield* Caller;
      const inbox = yield* Inbox;
      const answer = yield* inbox.markNudgeRead(caller, String(params["id"]));
      return yield* HttpServerResponse.schemaJson(NudgeResponseSchema)(answer);
    }),
  method: "POST",
  path: nudgeReadPath,
  segments: { id: (segment) => DIGITS.test(segment) },
};

const keepRoute: Route<Needs> = {
  handle: (params) =>
    Effect.gen(function* keepDeactivationOfferRouteHandler() {
      const caller = yield* Caller;
      const inbox = yield* Inbox;
      const answer = yield* inbox.keepDeactivationOffer(caller, String(params["id"]));
      return yield* HttpServerResponse.schemaJson(DeactivationOfferResponseSchema)(answer);
    }),
  method: "POST",
  path: deactivationOfferKeepPath,
  segments: { id: (segment) => DIGITS.test(segment) },
};

const deactivatedQuietAgentReadRoute: Route<Needs> = {
  handle: (params) =>
    Effect.gen(function* deactivatedQuietAgentReadRouteHandler() {
      const caller = yield* Caller;
      const inbox = yield* Inbox;
      const answer = yield* inbox.markDeactivatedQuietAgentRead(caller, String(params["id"]));
      return yield* HttpServerResponse.schemaJson(DeactivatedQuietAgentResponseSchema)(answer);
    }),
  method: "POST",
  path: deactivatedQuietAgentReadPath,
  segments: { id: (segment) => DIGITS.test(segment) },
};

function followRoute(method: Change, change: "follow" | "unfollow"): Route<Needs> {
  return {
    handle: (params) =>
      Effect.gen(function* followRouteHandler() {
        const caller = yield* Caller;
        const inbox = yield* Inbox;
        const answer = yield* inbox[change](caller, String(params["id"]));
        return yield* HttpServerResponse.schemaJson(FollowResponseSchema)(answer);
      }),
    method,
    path: followPath,
    segments: { id: (segment) => DIGITS.test(segment) },
  };
}

function subscriptionRoute(method: Change, change: "subscribe" | "unsubscribe"): Route<Needs> {
  return {
    handle: (params) =>
      Effect.gen(function* subscriptionRouteHandler() {
        const caller = yield* Caller;
        const inbox = yield* Inbox;
        const answer = yield* inbox[change](caller, String(params["name"]));
        return yield* HttpServerResponse.schemaJson(SubscriptionResponseSchema)(answer);
      }),
    method,
    path: subscriptionPath,
  };
}

export { Inbox, inboxLayer } from "./lib/server/service.ts";

/** Offline alerts: raised by presence, listed in the owner's inbox, sent to the owner's streams as they change. */
export { OfflineAlerts, offlineAlertsLayer } from "./lib/server/offline-alerts.ts";

/**
 * The nudge scheduler: one fiber in its Layer's scope that raises every Nudge as it falls due, from storage, and
 * `raised`, which hears each one. A new message, a close or a reopen wakes it to look again.
 */
export { Nudges, nudgesLayer } from "./lib/server/nudge-scheduler.ts";

/**
 * Deactivation offers: listed in each recipient's inbox, answered Keep, and sent to each recipient's streams as one is
 * raised or cleared. The nudge scheduler raises them. Beside them, entries about deactivated quiet agents: the nudge scheduler has it
 * deactivate each agent quiet for 90 days, announcing the deactivation and ending its connections, and each entry is
 * listed in its recipients' inboxes, marked read, and sent to their streams as it is recorded or read. Reactivating the
 * agent reads its entries.
 */
export { DeactivationOffers, deactivationOffersLayer } from "./lib/server/deactivation-offers.ts";

/**
 * The Schemas of an inbox item, a Nudge and its ID, a read position, a moved-back one and a subscription, for the
 * events that carry one.
 */
export {
  DeactivatedQuietAgentSchema,
  DeactivationOfferSchema,
  InboxAgentJoinRequestSchema,
  InboxItemSchema,
  MovedBackReadPositionSchema,
  OfflineAlertSchema,
  NudgeIdSchema,
  NudgeSchema,
  ReadPositionSchema,
  SubscriptionResponseSchema,
} from "./lib/server/wire.ts";

/**
 * The inbox routes, for the server's route list. They need `Caller`, which the token gate provides, `Inbox`, which
 * `inboxLayer` provides.
 */
export const inboxRoutes: readonly Route<Needs>[] = [
  inboxRoute,
  historyRoute,
  readPositionsRoute,
  ackRoute,
  ackAllRoute,
  markUnreadRoute,
  alertReadRoute,
  nudgeReadRoute,
  keepRoute,
  deactivatedQuietAgentReadRoute,
  followRoute("PUT", "follow"),
  followRoute("DELETE", "unfollow"),
  subscriptionRoute("PUT", "subscribe"),
  subscriptionRoute("DELETE", "unsubscribe"),
];

/** The response Schemas of the inbox routes, for the SDK's generated validators. */
export const inboxResponseSchemas = {
  AckAllResponse: AckAllResponseSchema,
  AckResponse: AckResponseSchema,
  DeactivatedQuietAgentResponse: DeactivatedQuietAgentResponseSchema,
  DeactivationOfferResponse: DeactivationOfferResponseSchema,
  FollowResponse: FollowResponseSchema,
  InboxHistoryResponse: InboxHistoryResponseSchema,
  InboxResponse: InboxResponseSchema,
  MarkUnreadResponse: MarkUnreadResponseSchema,
  NudgeResponse: NudgeResponseSchema,
  OfflineAlertResponse: OfflineAlertResponseSchema,
  ReadPositionsResponse: ReadPositionsResponseSchema,
  SubscriptionResponse: SubscriptionResponseSchema,
};
