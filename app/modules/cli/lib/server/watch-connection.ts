import type {
  AgentJoinRequestsEvent,
  ConnectedEvent,
  CookoutEvent,
  DeactivatedQuietAgentEvent,
  DeactivationOfferEvent,
  EventStream,
  InboxItemEvent,
  MessageId,
  NudgeEvent,
  Reaction,
  WatchOptions,
} from "../../../sdk/index.ts";
import { Array as Arr, Cause, Duration, Effect, Exit, Option, Predicate, Queue, Ref, Schedule, Stream } from "effect";
import type { CallFailure, ClientWithAgentSessionState } from "./adapters/sdk.ts";
import { callClient, toFailure } from "./adapters/sdk.ts";
import type { Scope } from "effect";
import { eventsPath } from "../../../events/index.ts";
import { note } from "./watch-lines.ts";

type WatchedEvent =
  | InboxItemEvent
  | NudgeEvent
  | DeactivationOfferEvent
  | DeactivatedQuietAgentEvent
  | AgentJoinRequestsEvent;

type Heard = WatchedEvent | ConnectedEvent;

const SERVER_ERROR = 500;
const NO_STATUS = 0;
const heartbeat: readonly Heard[] = [];
const THREE_MISSED_HEARTBEATS = "45 seconds";
const FIRST_RECONNECT_SECONDS = 1;
const LONGEST_RECONNECT_SECONDS = Duration.toSeconds("30 seconds");
const DOUBLING = 2;
const CLEAN_CLOSE_WAIT = "2 seconds";
const streamEnded: CallFailure = { code: "cli_error", message: "The server ended the stream." };
const heardNothing: CallFailure = { code: "cli_error", message: "Heard nothing from the server for 45 s." };

function resumeFrom(lastSeen: Option.Option<MessageId>): Pick<WatchOptions, "lastEventId"> {
  return Option.match(lastSeen, { onNone: () => ({}), onSome: (lastEventId) => ({ lastEventId }) });
}

function closeStream(events: EventStream): Effect.Effect<void> {
  return Effect.ignore(Effect.tryPromise({ catch: toFailure, try: () => events.close() }));
}

function closeStreamCleanly(events: EventStream): Effect.Effect<void> {
  return Effect.tryPromise({ catch: toFailure, try: () => events.closeCleanly() }).pipe(
    Effect.timeout(CLEAN_CLOSE_WAIT),
    Effect.matchEffect({ onFailure: () => closeStream(events), onSuccess: () => Effect.void }),
  );
}

function isTimeout(failure: unknown): boolean {
  return typeof failure === "object" && failure !== null && "code" in failure && failure.code === "timeout";
}

function isCleanExit(exit: Exit.Exit<unknown, unknown>): boolean {
  if (Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)) {
    return true;
  }
  return isTimeout(Cause.squash(exit.cause));
}

function closedOnExit(
  wasDropped: Effect.Effect<boolean>,
): (events: EventStream, exit: Exit.Exit<unknown, unknown>) => Effect.Effect<void> {
  return (events, exit) =>
    Effect.flatMap(wasDropped, (dropped) => {
      if (dropped || !isCleanExit(exit)) {
        return closeStream(events);
      }
      return closeStreamCleanly(events);
    });
}

function isInboxItem(event: CookoutEvent | Heard): event is InboxItemEvent {
  return event.type === "inbox-item";
}

function isWatched(event: CookoutEvent | Heard): event is WatchedEvent {
  if (event.type === "deactivation-offer") {
    return !event.deactivationOffer.cleared;
  }
  if (event.type === "deactivated-quiet-agent") {
    return !event.deactivatedQuietAgent.read;
  }
  if (event.type === "agent-join-requests") {
    return Arr.isReadonlyArrayNonEmpty(event.agentJoinRequests);
  }
  return event.type === "inbox-item" || event.type === "nudge";
}

function heardOn(
  events: EventStream,
  signals: Stream.Stream<readonly Heard[], CallFailure>,
): Stream.Stream<readonly Heard[], CallFailure> {
  const items = Stream.fromAsyncIterable(events, toFailure).pipe(Stream.filter(isWatched), Stream.map(Arr.of));
  const untilEnded = Stream.concat(items, Stream.fail(streamEnded));
  return Stream.merge(untilEnded, signals, { haltStrategy: "left" }).pipe(
    Stream.timeoutOrElse({ duration: THREE_MISSED_HEARTBEATS, orElse: () => Stream.fail(heardNothing) }),
  );
}

function droppedWhenFailed(
  markDropped: Effect.Effect<void>,
): (heard: Stream.Stream<readonly Heard[], CallFailure>) => Stream.Stream<readonly Heard[], CallFailure> {
  return Stream.tapError(() => markDropped);
}

function connect(
  opened: ClientWithAgentSessionState,
  lastSeen: Option.Option<MessageId>,
): Effect.Effect<Stream.Stream<readonly Heard[], CallFailure>, CallFailure, Scope.Scope> {
  return Effect.gen(function* openConnection() {
    const signals = yield* Queue.unbounded<readonly Heard[]>();
    function onHeartbeat(): void {
      Queue.offerUnsafe(signals, heartbeat);
    }
    function onConnected(latestMessageId: MessageId | null): void {
      Queue.offerUnsafe(signals, [{ latestMessageId, type: "connected" }]);
    }
    const options = { ...resumeFrom(lastSeen), onConnected, onHeartbeat };
    const watching = callClient((client) => client.watch(options))(opened);
    const dropped = yield* Ref.make(false);
    const events = yield* Effect.acquireRelease(Effect.interruptible(watching), closedOnExit(Ref.get(dropped)));
    return heardOn(events, Stream.fromQueue(signals)).pipe(droppedWhenFailed(Ref.set(dropped, true)));
  });
}

function isDropped({ code, status = NO_STATUS }: CallFailure): boolean {
  return code === "cli_error" || code === "unreachable" || status >= SERVER_ERROR;
}

function keepTrying({ input }: { readonly input: CallFailure }): boolean {
  return isDropped(input);
}

function whyUnavailable({ message, status }: CallFailure): string {
  if (Predicate.isUndefined(status)) {
    return message;
  }
  return String(status);
}

interface Retry {
  readonly attempt: number;
  readonly input: CallFailure;
}

function secondsBefore(attempt: number): number {
  return Math.min(FIRST_RECONNECT_SECONDS * DOUBLING ** (attempt - FIRST_RECONNECT_SECONDS), LONGEST_RECONNECT_SECONDS);
}

function sayRetrying({ attempt, input }: Retry): Effect.Effect<Duration.Input> {
  const seconds = secondsBefore(attempt);
  const why = whyUnavailable(input);
  return Effect.as(note({ reconnecting: `board unavailable (${why}), retrying in ${String(seconds)}s` }), {
    seconds,
  });
}

const reconnectBackoff = Schedule.forever.pipe(
  Schedule.setInputType<CallFailure>(),
  Schedule.while(keepTrying),
  Schedule.modifyDelay(sayRetrying),
);

function whileUnavailable<Value, Needs>(
  call: Effect.Effect<Value, CallFailure, Needs>,
): Effect.Effect<Value, CallFailure, Needs> {
  return Effect.retry(call, reconnectBackoff);
}

function start(
  opened: ClientWithAgentSessionState,
): Effect.Effect<Stream.Stream<readonly Heard[], CallFailure>, CallFailure, Scope.Scope> {
  return whileUnavailable(connect(opened, Option.none()));
}

function sayWatching(opened: ClientWithAgentSessionState): Effect.Effect<void> {
  return note({ watching: `${opened.connection.url}${eventsPath}` });
}

function lastSeenAfter(event: Heard): (seen: Option.Option<MessageId>) => Option.Option<MessageId> {
  if (isInboxItem(event)) {
    const { id } = event.item.message;
    return (seen) =>
      Option.some(
        Option.getOrElse(
          Option.filter(seen, (last) => last > id),
          () => id,
        ),
      );
  }
  if (event.type !== "connected") {
    return (seen) => seen;
  }
  return Option.orElse(() => Option.fromNullishOr(event.latestMessageId));
}

function reactionKey({ identity, messageId, reactedAt, reaction }: Reaction): string {
  return Arr.join([String(messageId), identity, reaction, reactedAt], " ");
}

function reactionKeysOf(event: Heard): readonly string[] {
  if (!isInboxItem(event)) {
    return [];
  }
  return Arr.map(event.item.newReactions ?? [], reactionKey);
}

function withPrinted(
  keys: readonly string[],
): (before: ReadonlySet<string>) => readonly [boolean, ReadonlySet<string>] {
  return (before) => [Arr.some(keys, (key) => !before.has(key)), new Set([...before, ...keys])];
}

interface Resuming {
  readonly opened: ClientWithAgentSessionState;
  readonly first: Stream.Stream<readonly Heard[], CallFailure>;
}

function source({ first, opened }: Resuming): Stream.Stream<Heard, CallFailure> {
  return Stream.unwrap(
    Effect.gen(function* resumable() {
      const unused = yield* Ref.make(Option.some(first));
      const lastSeen = yield* Ref.make(Option.none<MessageId>());
      const printed = yield* Ref.make<ReadonlySet<string>>(new Set());
      function isUnprinted(event: Heard): Effect.Effect<boolean> {
        const keys = reactionKeysOf(event);
        if (!Arr.isReadonlyArrayNonEmpty(keys)) {
          return Effect.succeed(true);
        }
        return Ref.modify(printed, withPrinted(keys));
      }
      const next = Effect.flatMap(
        Ref.getAndSet(unused, Option.none()),
        Option.match({
          onNone: () => Effect.flatMap(Ref.get(lastSeen), (seen) => connect(opened, seen)),
          onSome: Effect.succeed,
        }),
      );
      return Stream.unwrap(next).pipe(
        Stream.retry(reconnectBackoff),
        Stream.flattenIterable,
        Stream.tap((event) => Ref.update(lastSeen, lastSeenAfter(event))),
        Stream.filterEffect(isUnprinted),
      );
    }),
  );
}

export { type Heard, type WatchedEvent, isWatched, sayWatching, source, start, whileUnavailable };
