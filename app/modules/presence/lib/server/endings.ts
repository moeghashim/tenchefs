import type { BookState, Connection } from "./book.ts";
import { DateTime, Effect, Option, PubSub } from "effect";
import { endOfTokens, refusalFor, refusedEnd, sentWithEnded } from "./ends.ts";
import type { Ending } from "./ending.ts";
import { IdentityChanges } from "../../../identities/server.ts";
import type { LiveConnectionId } from "../../index.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Scope } from "effect";
import { Storage } from "../../../storage/server.ts";
import { endAtOnce } from "./ending.ts";
import { isoTimeOf } from "../../../time/server.ts";

type IdentityName = Ending["identity"];

interface Book {
  readonly read: Effect.Effect<BookState>;
  readonly modify: <Result>(
    identity: IdentityName,
    update: (state: BookState) => readonly [Result, BookState],
  ) => Effect.Effect<Result>;
  readonly inBackground: (effect: Effect.Effect<void>) => Effect.Effect<void>;
  readonly forget: (identity: IdentityName) => Effect.Effect<void>;
}

interface Ended {
  readonly connections: readonly LiveConnectionId[];
  readonly refusal: Refusal;
}

interface Ends {
  readonly book: Book;
  readonly announce: (ended: Ended) => Effect.Effect<void>;
  readonly heard: Effect.Effect<PubSub.Subscription<Ended>, never, Scope.Scope>;
}

interface EndNow extends Omit<Ending, "endedAt" | "state"> {
  readonly refusal: Refusal;
}

interface HeldEnding {
  readonly ended: Effect.Effect<Refusal>;
  readonly refused: (refusal: Refusal) => Effect.Effect<Refusal>;
}

function endNow(ends: Ends, ending: EndNow): Effect.Effect<void> {
  return Effect.gen(function* endConnectionsNow() {
    const moment = yield* DateTime.now;
    const endedAt = isoTimeOf(moment);
    const connections = yield* ends.book.modify(ending.identity, (state) => endAtOnce({ ...ending, endedAt, state }));
    yield* ends.announce({ connections, refusal: ending.refusal });
  });
}

function heldEnding({
  ends,
  identity,
}: {
  readonly ends: Ends;
  readonly identity: IdentityName;
}): Effect.Effect<(connection: LiveConnectionId) => HeldEnding, never, Scope.Scope> {
  return Effect.gen(function* listenForEnds() {
    const heard = yield* ends.heard;
    return (connection: LiveConnectionId): HeldEnding => {
      const own = {
        always: false,
        ending: (_held: Connection, each: LiveConnectionId): boolean => each === connection,
        identity,
      };
      return {
        ended: PubSub.take(heard).pipe(
          Effect.repeat({ until: (each) => each.connections.includes(connection) }),
          Effect.map(({ refusal }) => refusal),
        ),
        refused: (refusal) => Effect.as(endNow(ends, { ...own, end: refusedEnd(refusal), refusal }), refusal),
      };
    };
  });
}

function openEnds(book: Book): Effect.Effect<Ends> {
  return Effect.gen(function* openEndsHub() {
    const hub = yield* PubSub.unbounded<Ended>();
    return { announce: (ended) => Effect.asVoid(PubSub.publish(hub, ended)), book, heard: PubSub.subscribe(hub) };
  });
}

function endsEndedTokens(ends: Ends): Effect.Effect<void, never, IdentityChanges | Storage | Scope.Scope> {
  return Effect.gen(function* endConnectionsOfEndedTokens() {
    const changes = yield* IdentityChanges;
    const storage = yield* Storage;
    yield* changes.onTokensEnded((ended) =>
      Effect.gen(function* endConnectionsOfTokens() {
        const found = yield* storage
          .findIdentityByName(ended.identity)
          .pipe(Effect.map(Option.fromNullishOr), Effect.orElseSucceed(Option.none));
        const matches = sentWithEnded(ended.tokens);
        yield* endNow(ends, {
          always: ended.cause === "left",
          end: endOfTokens({ ended, found }),
          ending: (connection) => matches(connection),
          identity: ended.identity,
          refusal: refusalFor(ended.cause),
        });
      }),
    );
  });
}

export { type Book, type Ends, endsEndedTokens, heldEnding, openEnds };
