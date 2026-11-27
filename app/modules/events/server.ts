/**
 * Live updates on the backend: the route that opens a caller's Server-Sent
 * Events stream (ADR 0002). The stream merges separate event sources, each
 * started when the caller connects with the caller and the request, so each
 * new kind of event is one more entry in `sources` (`lib/server/sources.ts`):
 * a `connected` event with the board's latest message ID, its live connection
 * held only once every other source is listening, so the caller's own coming
 * online reaches the `presence` source of this very stream; the
 * caller's new inbox items, which the `Messages` service's hub feeds; the
 * caller's Nudges as the `Nudges` scheduler raises them, and as the `Inbox` marks them read; the
 * caller's new read positions, which the `Inbox` service's hub feeds on every
 * ack from any session; and, when the request asks with `?channels=all`,
 * every new message on every channel, every identity created, changed or
 * deleted (fed by the `IdentityChanges` hubs), every channel created or deleted (fed by the
 * `Channels` service's hubs), every command registered or rotated (fed by the
 * `WebhookCommandChanges` hub) and, to an agent's owner and to admins, every change
 * to the agent's agent session (fed by the `AgentSessions` service's hub), for
 * the web UI; and a comment
 * heartbeat every 15 s, so proxies keep the connection open. On a reconnect
 * with `Last-Event-ID`, the inbox items first replay what the caller missed;
 * only inbox items for new messages carry an event ID (a reaction's item has none), so the IDs on one stream strictly increase.
 * For a stream opened with an agent session token, one more source checks
 * every 30 s that the token is still live, moving its expiry on, here because
 * it needs the request's token. The stream
 * starts with a comment, so Node sends the headers at once and the caller
 * knows every source is listening. A source that sends a `refusal` event
 * (`agent_session_revoked` once `leave` or another session's `join --force`
 * revokes the token) ends the stream with it. The `connected` event names the stream's live connection, and
 * `DELETE /v1/events/:connection` (sent with the same credential) marks it as closing cleanly: a `cookout watch`
 * exiting on purpose says so first, so its end is expected (ADR "how a live connection ends"). The route sits behind the
 * server's token gate, and opens only while the caller holds fewer than `COOKOUT_STREAMS_PER_IDENTITY` streams (429
 * `too_many_streams`, ADR 0033); closing the stream frees its place. Every stream, whatever its query, is a live
 * connection of the caller's for as long as it is open, which keeps the caller online (`PresenceRegistry`), and the
 * all-channels feed sends each identity's changed presence as a `presence` event; `PresenceResponse`, the answer to
 * `GET /v1/presence`, is among the Schemas below so the SDK reads it with the event.
 */
import {
  AgentJoinRequestsEventSchema,
  AgentSessionEventSchema,
  ChannelDeletedEventSchema,
  ChannelEventSchema,
  CleanCloseResponseSchema,
  CommandEventSchema,
  ConnectedEventSchema,
  DeactivatedQuietAgentEventSchema,
  DeactivationOfferEventSchema,
  IdentityDeletedEventSchema,
  IdentityEventSchema,
  InboxItemEventSchema,
  MessageDeletedEventSchema,
  MessageEventSchema,
  NudgeEventSchema,
  NudgeReadEventSchema,
  OfflineAlertEventSchema,
  PresenceEventSchema,
  PresenceResponseSchema,
  ReactionEventSchema,
  ReadPositionEventSchema,
  ReadPositionMovedBackEventSchema,
  ReadReceiptEventSchema,
  SubscriptionEventSchema,
  ThreadEventSchema,
  WakeRunResponseSchema,
} from "./lib/server/wire.ts";
import { Effect, Exit, Scope, Stream } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { isLast, lastEventIdIn, sseText } from "./lib/server/source.ts";
import { Caller } from "../identities/server.ts";
import type { Limits } from "../limits/server.ts";
import type { Route } from "../http/server.ts";
import type { SourceNeeds } from "./lib/server/sources.ts";
import { cleanCloseRoutes } from "./lib/server/clean-close.ts";
import { eventsPath } from "./index.ts";
import { holdStreamPlace } from "../limits/server.ts";
import { sources } from "./lib/server/sources.ts";

type Needs = SourceNeeds | Caller | Limits;

const SSE_HEADERS = { "cache-control": "no-cache" } as const;
const OPENED = ": open\n\n";

const eventsRoute: Route<Needs> = {
  handle: () =>
    Effect.gen(function* openEventStream() {
      const caller = yield* Caller;
      const { headers, url } = yield* HttpServerRequest.HttpServerRequest;
      const lastEventId = lastEventIdIn(headers["last-event-id"]);
      const connection = yield* Scope.make();
      yield* holdStreamPlace.pipe(Scope.provide(connection));
      const request = { authorization: headers["authorization"], caller, lastEventId, url };
      const listening = yield* Effect.forEach(sources.listening, (source) => source(request), {
        concurrency: "unbounded",
      }).pipe(Scope.provide(connection));
      const held = yield* sources.connected(request).pipe(Scope.provide(connection));
      const body = Stream.mergeAll([held, ...listening], { concurrency: "unbounded" }).pipe(
        Stream.takeUntil(isLast),
        Stream.map(sseText),
        Stream.prepend([OPENED]),
        Stream.encodeText,
        Stream.ensuring(Scope.close(connection, Exit.void)),
      );
      return HttpServerResponse.stream(body, { contentType: "text/event-stream", headers: SSE_HEADERS });
    }),
  method: "GET",
  path: eventsPath,
};

/**
 * The events route, for the server's route list. It needs `Caller`, which the token gate provides, and what its
 * sources need: `Inbox`, which `inboxLayer` provides, `Messages`, which `messagesLayer` provides, and `AgentSessions`,
 * which `agentSessionsLayer` provides.
 */
export const eventRoutes: readonly Route<Needs>[] = [eventsRoute, ...cleanCloseRoutes];

/** The Schemas of the stream's events, for the SDK's generated validators. */
export const eventResponseSchemas = {
  AgentJoinRequestsEvent: AgentJoinRequestsEventSchema,
  AgentSessionEvent: AgentSessionEventSchema,
  ChannelDeletedEvent: ChannelDeletedEventSchema,
  ChannelEvent: ChannelEventSchema,
  CleanCloseResponse: CleanCloseResponseSchema,
  CommandEvent: CommandEventSchema,
  ConnectedEvent: ConnectedEventSchema,
  DeactivatedQuietAgentEvent: DeactivatedQuietAgentEventSchema,
  DeactivationOfferEvent: DeactivationOfferEventSchema,
  IdentityDeletedEvent: IdentityDeletedEventSchema,
  IdentityEvent: IdentityEventSchema,
  InboxItemEvent: InboxItemEventSchema,
  MessageDeletedEvent: MessageDeletedEventSchema,
  MessageEvent: MessageEventSchema,
  NudgeEvent: NudgeEventSchema,
  NudgeReadEvent: NudgeReadEventSchema,
  OfflineAlertEvent: OfflineAlertEventSchema,
  PresenceEvent: PresenceEventSchema,
  PresenceResponse: PresenceResponseSchema,
  ReactionEvent: ReactionEventSchema,
  ReadPositionEvent: ReadPositionEventSchema,
  ReadPositionMovedBackEvent: ReadPositionMovedBackEventSchema,
  ReadReceiptEvent: ReadReceiptEventSchema,
  SubscriptionEvent: SubscriptionEventSchema,
  ThreadEvent: ThreadEventSchema,
  WakeRunResponse: WakeRunResponseSchema,
};
