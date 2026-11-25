import { Array as Arr, Duration, Effect, Option, Ref, Stream } from "effect";
import type { CallFailure, ClientWithAgentSessionState } from "./adapters/sdk.ts";
import { CommandFailed, refused } from "./output.ts";
import type { ConnectedEvent, MessageId } from "../../../sdk/index.ts";
import type { Heard, WatchedEvent } from "./watch-connection.ts";
import { agentSessionExpired, agentSessionRevoked } from "../../../agent-sessions/index.ts";
import { isWatched, whileUnavailable } from "./watch-connection.ts";
import { note, printLine } from "./watch-lines.ts";
import type { Format } from "./watch-lines.ts";
import { callClient } from "./adapters/sdk.ts";
import { watchReplaced } from "../../../presence/index.ts";

interface StopCondition {
  readonly once: boolean;
  readonly untilMention: boolean;
  readonly timeout: number | null;
}

const NO_UNREAD = 0;
const NOTHING_POSTED = 0;
const FIRST = 1;
const exitCodes = { agentSessionEnded: 4, replaced: 6, timeout: 2, tokenRefused: 3 } as const;
const FATAL_EXIT_CODES: ReadonlyMap<string, number> = new Map([
  ["token_missing", exitCodes.tokenRefused],
  ["token_unknown", exitCodes.tokenRefused],
  ["token_revoked", exitCodes.tokenRefused],
  [agentSessionRevoked, exitCodes.agentSessionEnded],
  [agentSessionExpired, exitCodes.agentSessionEnded],
  [watchReplaced, exitCodes.replaced],
]);

interface Unread {
  readonly count: number;
  readonly mentioned: boolean;
}

const NONE_UNREAD: Unread = { count: NO_UNREAD, mentioned: false };

function unreadUpTo(opened: ClientWithAgentSessionState, latest: MessageId | null): Effect.Effect<Unread, CallFailure> {
  if (latest === null) {
    return Effect.succeed(NONE_UNREAD);
  }
  return Effect.map(
    whileUnavailable(callClient((client) => client.inbox())(opened)),
    ({ agentJoinRequests, deactivatedQuietAgents, deactivationOffers, items, nudges }) => {
      const unread = Arr.filter(items, ({ message }) => message.id <= latest);
      const mentioned = Arr.some(unread, ({ reasons }) => reasons.includes("mention"));
      const asking = [...nudges, ...deactivationOffers, ...deactivatedQuietAgents, ...agentJoinRequests];
      return { count: unread.length + asking.length, mentioned: mentioned || Arr.isReadonlyArrayNonEmpty(asking) };
    },
  );
}

function sayUnread(format: Format, { count }: Unread): Effect.Effect<void> {
  if (count === NO_UNREAD) {
    return Effect.void;
  }
  return printLine({ format, json: { count, type: "unread" }, text: `${String(count)} unread, run cookout inbox` });
}

function stopsAtStartUp(stop: StopCondition, { count, mentioned }: Unread): boolean {
  if (stop.untilMention) {
    return mentioned;
  }
  return stop.once && count > NO_UNREAD;
}

function isNewerThan(counted: Option.Option<number>, event: WatchedEvent): boolean {
  if (event.type !== "inbox-item") {
    return true;
  }
  const { item } = event;
  return item.reasons.includes("reaction") || !Option.exists(counted, (latest) => item.message.id <= latest);
}

interface Counting {
  readonly opened: ClientWithAgentSessionState;
  readonly format: Format;
  readonly stop: StopCondition;
}

function startUpLine({
  format,
  opened,
  stop,
}: Counting): (events: Stream.Stream<Heard, CallFailure>) => Stream.Stream<WatchedEvent, CallFailure> {
  return (events) =>
    Stream.unwrap(
      Effect.gen(function* countOnce() {
        const counted = yield* Ref.make(Option.none<number>());
        const sayOnce = Effect.fnUntraced(function* sayUnreadOnce({ latestMessageId }: ConnectedEvent) {
          const toCount = yield* Ref.modify(counted, (already) => [
            Option.filter(Option.some(latestMessageId), () => Option.isNone(already)),
            Option.orElseSome(already, () => latestMessageId ?? NOTHING_POSTED),
          ]);
          const stops = yield* Effect.forEach(
            Option.toArray(toCount),
            (latest) =>
              Effect.flatMap(unreadUpTo(opened, latest), (unread) =>
                Effect.as(sayUnread(format, unread), stopsAtStartUp(stop, unread)),
              ),
            { concurrency: 1 },
          );
          return stops.includes(true);
        });
        function isNewer(event: WatchedEvent): Effect.Effect<boolean> {
          return Effect.map(Ref.get(counted), (latest) => isNewerThan(latest, event));
        }
        return events.pipe(
          Stream.takeUntilEffect((event) => {
            if (isWatched(event)) {
              return Effect.succeed(false);
            }
            return sayOnce(event);
          }),
          Stream.filter(isWatched),
          Stream.filterEffect(isNewer),
        );
      }),
    );
}

function stopsUntilMention(event: WatchedEvent): boolean {
  return event.type !== "inbox-item" || event.item.reasons.includes("mention");
}

function wanted(
  { once, untilMention }: StopCondition,
  events: Stream.Stream<WatchedEvent, CallFailure>,
): Stream.Stream<WatchedEvent, CallFailure> {
  if (untilMention) {
    return Stream.take(Stream.filter(events, stopsUntilMention), FIRST);
  }
  if (once) {
    return Stream.take(events, FIRST);
  }
  return events;
}

function untilStopped(
  stop: StopCondition,
): (events: Stream.Stream<WatchedEvent, CallFailure>) => Stream.Stream<WatchedEvent, CallFailure> {
  const seconds = stop.timeout;
  if (seconds === null) {
    return (events) => wanted(stop, events);
  }
  return (events) =>
    Stream.timeoutOrElse(wanted(stop, events), {
      duration: Duration.seconds(seconds),
      orElse: () => Stream.fail({ code: "timeout", message: `No item in ${String(seconds)} s.` }),
    });
}

function fatalExitCode(code: string): Option.Option<number> {
  return Option.fromNullishOr(FATAL_EXIT_CODES.get(code));
}

function stopped(format: Format): (failure: CallFailure) => Effect.Effect<never, CommandFailed> {
  return (failure) => {
    const { code, message } = failure;
    if (code === "timeout") {
      return Effect.andThen(note({ timeout: message }), CommandFailed.make({ code, exitCode: exitCodes.timeout }));
    }
    return Option.match(fatalExitCode(code), {
      onNone: () => refused(failure),
      onSome: (exitCode) =>
        Effect.andThen(
          printLine({
            format,
            json: { error: { code, message } },
            text: `cookout watch stopped: ${message} (${code})`,
          }),
          CommandFailed.make({ code, exitCode }),
        ),
    });
  };
}

export { type StopCondition, startUpLine, stopped, untilStopped };
