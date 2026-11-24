import type { Announce, AnnounceNeeds } from "./announce.ts";
import { Array as Arr, Effect, PubSub, Stream, SynchronizedRef } from "effect";
import type { Book, Ends } from "./endings.ts";
import type { BookState, Connection, Reach } from "./book.ts";
import type { LiveConnectionId, Presence } from "../../index.ts";
import type { Option, Scope } from "effect";
import type { StorageUnavailable, StoredPresence } from "../../../storage/server.ts";
import { announced, announcer, now } from "./announce.ts";
import {
  connect,
  endBootGrace,
  endGrace,
  forget,
  liveConnectionsIn,
  onlineAtStop,
  openBook,
  presenceIn,
  release,
} from "./book.ts";
import { endsEndedTokens, heldEnding, openEnds } from "./endings.ts";
import { reachablePresenceIn, withReach } from "./reach.ts";
import { IdentityChanges } from "../../../identities/server.ts";
import type { Refusal } from "../../../http/index.ts";
import { Storage } from "../../../storage/server.ts";
import { closeCleanly } from "./ending.ts";

type IdentityName = Presence["identity"];

interface HeldConnection {
  readonly connection: LiveConnectionId;
  readonly ended: Effect.Effect<Refusal>;
  readonly refused: (refusal: Refusal) => Effect.Effect<Refusal>;
}

interface Registry {
  readonly hold: (identity: IdentityName, connection: Connection) => Effect.Effect<HeldConnection, never, Scope.Scope>;
  readonly closeCleanly: (identity: IdentityName, connection: LiveConnectionId) => Effect.Effect<boolean>;
  readonly presenceOf: (identity: IdentityName) => Effect.Effect<Presence>;
  readonly livePresenceOf: (identity: IdentityName) => Effect.Effect<Presence>;
  readonly changed: Effect.Effect<PubSub.Subscription<Presence>, never, Scope.Scope>;
  readonly liveConnections: (identity: IdentityName) => Effect.Effect<number>;
  readonly setReach: (identity: IdentityName, reach: Option.Option<Reach>) => Effect.Effect<void>;
}

const ONE_AT_A_TIME = { concurrency: 1, discard: true } as const;

interface Graces {
  readonly graceMillis: number;
  readonly bootGraceMillis: number;
}

function changed(book: Book, identity: IdentityName, update: (state: BookState) => BookState): Effect.Effect<void> {
  return Effect.asVoid(book.modify(identity, (state) => [true, update(state)] as const));
}

function closedLive(
  book: Book,
  graceMillis: number,
  identity: IdentityName,
): (connection: LiveConnectionId) => Effect.Effect<void> {
  return (connection) =>
    Effect.gen(function* closeLive() {
      const closedAt = yield* now;
      yield* changed(book, identity, (state) => release({ closedAt, connection, identity, state }));
      const graceEnds = changed(book, identity, (state) => endGrace({ connection, identity, state }));
      yield* book.inBackground(Effect.andThen(Effect.sleep(graceMillis), graceEnds));
    });
}

function held(
  ends: Ends & { readonly graceMillis: number },
  { connection, identity }: { readonly identity: IdentityName; readonly connection: Connection },
): Effect.Effect<HeldConnection, never, Scope.Scope> {
  return Effect.gen(function* holdConnection() {
    const endingOf = yield* heldEnding({ ends, identity });
    const opened = ends.book.modify(identity, (state) => connect({ connection, identity, state }));
    const id = yield* Effect.acquireRelease(opened, closedLive(ends.book, ends.graceMillis, identity));
    return { ...endingOf(id), connection: id };
  });
}

function bootGraceEnds(book: Book, kept: readonly StoredPresence[]): Effect.Effect<void> {
  return Effect.forEach(
    kept,
    ({ identity }) => changed(book, identity, (state) => endBootGrace({ identity, state })),
    ONE_AT_A_TIME,
  );
}

function keptOnStop(book: Book, announce: Announce): Effect.Effect<void> {
  return Effect.flatMap(book.read, (state) => Effect.forEach(onlineAtStop(state), announce.record, ONE_AT_A_TIME));
}

function bookOf(announce: Announce, kept: readonly StoredPresence[]): Effect.Effect<Book, never, Scope.Scope> {
  return Effect.gen(function* openRegistryBook() {
    const scope = yield* Effect.scope;
    const ref = yield* SynchronizedRef.make(openBook(kept));
    return {
      forget: (identity) => SynchronizedRef.update(ref, (state) => forget({ identity, state })),
      inBackground: (effect) => Effect.asVoid(Effect.forkIn(effect, scope)),
      modify: (identity, update) =>
        SynchronizedRef.modifyEffect(ref, (state) => {
          const [result, next] = update(state);
          const announcing = announced({ after: next, announce, before: state, identity });
          return Effect.as(announcing, [result, next] as const);
        }),
      read: SynchronizedRef.get(ref),
    };
  });
}

function forgetsDeleted(book: Book): Effect.Effect<void, never, IdentityChanges | Scope.Scope> {
  return Effect.gen(function* forgetDeletedIdentities() {
    const changes = yield* IdentityChanges;
    const deleted = yield* changes.deleted;
    yield* Stream.fromSubscription(deleted).pipe(
      Stream.runForEach(({ name }) => book.forget(name)),
      Effect.forkScoped,
    );
  });
}

function keptPresence(storage: Storage["Service"]): Effect.Effect<readonly StoredPresence[], StorageUnavailable> {
  return Effect.flatMap(storage.listIdentities(), (all) => storage.listPresence(Arr.map(all, ({ name }) => name)));
}

type RegistryNeeds = Storage | IdentityChanges | AnnounceNeeds;

function openRegistry(graces: Graces): Effect.Effect<Registry, StorageUnavailable, RegistryNeeds | Scope.Scope> {
  return Effect.gen(function* openPresenceRegistry() {
    const storage = yield* Storage;
    const announce = yield* announcer(storage);
    const kept = yield* keptPresence(storage);
    const book = yield* bookOf(announce, kept);
    const ends = yield* openEnds(book);
    const wereOnline = Arr.filter(kept, ({ online }) => online);
    yield* book.inBackground(Effect.andThen(Effect.sleep(graces.bootGraceMillis), bootGraceEnds(book, wereOnline)));
    yield* Effect.addFinalizer(() => keptOnStop(book, announce));
    yield* Effect.andThen(forgetsDeleted(book), endsEndedTokens(ends));
    return {
      changed: PubSub.subscribe(announce.hub),
      closeCleanly: (identity, connection) =>
        book.modify(identity, (state) => closeCleanly({ connection, identity, state })),
      hold: (identity, connection) => held({ ...ends, graceMillis: graces.graceMillis }, { connection, identity }),
      liveConnections: (identity) => Effect.map(book.read, (state) => liveConnectionsIn({ identity, state })),
      livePresenceOf: (identity) => Effect.map(book.read, (state) => presenceIn({ identity, state })),
      presenceOf: (identity) => Effect.map(book.read, (state) => reachablePresenceIn({ identity, state })),
      setReach: (identity, reach) => changed(book, identity, (state) => withReach({ identity, reach, state })),
    };
  });
}

export { type Registry, type RegistryNeeds, openRegistry };
export { openReplacements, watchReplacedRefusal } from "./replacement.ts";
export { connectionOf } from "./connection.ts";
export type { Connection } from "./book.ts";
