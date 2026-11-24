import { Array as Arr, Option, Predicate } from "effect";
import type { IdentityName, TokenHash } from "../../../identities/index.ts";
import type { LiveConnectionDetail, LiveConnectionId, OfflineReason, Presence } from "../../index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { StoredPresence } from "../../../storage/server.ts";
import type { TriggerResult } from "../../../triggers/index.ts";
import { isLiveConnectionId } from "../../index.ts";

type SentWith =
  | { readonly kind: "web" }
  | { readonly kind: "identity token" }
  | { readonly kind: "agent session"; readonly hash: TokenHash };

interface End {
  readonly offlineReason?: OfflineReason;
  readonly unexpected: boolean;
}

interface Connection {
  readonly detail: LiveConnectionDetail;
  readonly sentWith: SentWith;
}

interface Grace {
  readonly closedAt: IsoTime;
  readonly closing: LiveConnectionId;
  readonly clean: boolean;
}

interface Held {
  readonly connections: ReadonlyMap<LiveConnectionId, Connection>;
  readonly latest: Option.Option<LiveConnectionDetail>;
  readonly grace: Option.Option<Grace>;
}

interface Reach {
  readonly lastResult?: TriggerResult;
}

interface BookState {
  readonly held: ReadonlyMap<IdentityName, Held>;
  readonly reach: ReadonlyMap<IdentityName, Reach>;
  readonly lastSeen: ReadonlyMap<IdentityName, IsoTime>;
  readonly ends: ReadonlyMap<IdentityName, End>;
  readonly onBootGrace: ReadonlySet<IdentityName>;
  readonly closingCleanly: ReadonlySet<LiveConnectionId>;
  readonly connectionsOpened: number;
}

interface At {
  readonly state: BookState;
  readonly identity: IdentityName;
}

interface Connecting extends At {
  readonly connection: Connection;
}

interface Closing extends At {
  readonly connection: LiveConnectionId;
}

interface Released extends Closing {
  readonly closedAt: IsoTime;
}

const NONE = 0;
const STEP = 1;
const NOT_HELD: Held = { connections: new Map(), grace: Option.none(), latest: Option.none() };
const CONNECTION_LOST: End = { offlineReason: "connection lost", unexpected: true };
const CLEAN_CLOSE: End = { unexpected: false };

function minted(count: number): LiveConnectionId {
  return Option.getOrThrow(Option.liftPredicate(count, isLiveConnectionId));
}

function heldBy({ identity, state }: At): Held {
  return state.held.get(identity) ?? NOT_HELD;
}

function withHeld({ identity, state }: At, held: Held): BookState {
  return { ...state, held: new Map([...state.held, [identity, held]]) };
}

function withEnd({ identity, state }: At, end: End): BookState {
  return { ...state, ends: new Map([...state.ends, [identity, end]]) };
}

function heldAs({ held, ...at }: At & { readonly held: Held }): BookState {
  return withHeld(at, held);
}

function endedAs({ end, ...at }: At & { readonly end: End }): BookState {
  return withEnd(at, end);
}

function withoutBootGrace({ identity, state }: At): ReadonlySet<IdentityName> {
  const left = new Set(state.onBootGrace);
  left.delete(identity);
  return left;
}

function isLive(held: Held): boolean {
  return held.connections.size > NONE || Option.isSome(held.grace);
}

function onlinePresence(identity: IdentityName, latest: Option.Option<LiveConnectionDetail>): Presence {
  return Option.match(latest, {
    onNone: () => ({ identity, online: true }),
    onSome: (connection) => ({ connection, identity, online: true }),
  });
}

function reasonOf(end: Pick<Presence, "offlineReason">): Pick<Presence, "offlineReason"> {
  const reason = Option.fromNullishOr(end.offlineReason);
  return Option.match(reason, { onNone: () => ({}), onSome: (offlineReason) => ({ offlineReason }) });
}

function endOf(at: At): Option.Option<End> {
  return Option.fromNullishOr(at.state.ends.get(at.identity));
}

function offlinePresence(at: At): Presence {
  const { identity, state } = at;
  const lastSeenAt = state.lastSeen.get(identity);
  const reason = Option.match(endOf(at), { onNone: () => ({}), onSome: reasonOf });
  if (Predicate.isUndefined(lastSeenAt)) {
    return { identity, online: false, ...reason };
  }
  return { identity, lastSeenAt, online: false, ...reason };
}

function endOfKept(kept: StoredPresence): Option.Option<End> {
  const { endedUnexpectedly } = kept;
  if (Predicate.isUndefined(endedUnexpectedly)) {
    return Option.none();
  }
  return Option.some({ ...reasonOf(kept), unexpected: endedUnexpectedly });
}

function openBook(kept: readonly StoredPresence[]): BookState {
  const wereOnline = Arr.filter(kept, ({ online }) => online);
  const ends = Arr.flatMap(kept, (each) =>
    Option.toArray(Option.map(endOfKept(each), (end) => [each.identity, end] as const)),
  );
  return {
    closingCleanly: new Set(),
    connectionsOpened: NONE,
    ends: new Map(ends),
    held: new Map(),
    lastSeen: new Map(Arr.map(kept, ({ identity, lastSeenAt }) => [identity, lastSeenAt] as const)),
    onBootGrace: new Set(Arr.map(wereOnline, ({ identity }) => identity)),
    reach: new Map(),
  };
}

function presenceIn(at: At): Presence {
  const held = heldBy(at);
  if (isLive(held)) {
    return onlinePresence(at.identity, held.latest);
  }
  if (at.state.onBootGrace.has(at.identity)) {
    return onlinePresence(at.identity, Option.none());
  }
  return offlinePresence(at);
}

function endIn(at: At): Pick<StoredPresence, "endedUnexpectedly" | "offlineReason"> {
  const end = at.state.ends.get(at.identity);
  if (presenceIn(at).online || Predicate.isUndefined(end)) {
    return {};
  }
  return { ...reasonOf(end), endedUnexpectedly: end.unexpected };
}

function withoutEnd(at: At): ReadonlyMap<IdentityName, End> {
  const ends = new Map(at.state.ends);
  ends.delete(at.identity);
  return ends;
}

function connect(connecting: Connecting): readonly [LiveConnectionId, BookState] {
  const opened = connecting.state.connectionsOpened + STEP;
  const connection = minted(opened);
  const connections = new Map([...heldBy(connecting).connections, [connection, connecting.connection]]);
  const latest = Option.some(connecting.connection.detail);
  const next = withHeld(connecting, { connections, grace: Option.none(), latest });
  const ends = withoutEnd(connecting);
  return [connection, { ...next, connectionsOpened: opened, ends, onBootGrace: withoutBootGrace(connecting) }];
}

function withoutCleanClose({ connection, state }: Closing): BookState {
  const left = new Set(state.closingCleanly);
  left.delete(connection);
  return { ...state, closingCleanly: left };
}

function isWebTab(held: Held, connection: LiveConnectionId): boolean {
  return Option.exists(
    Option.fromNullishOr(held.connections.get(connection)),
    ({ sentWith }) => sentWith.kind === "web",
  );
}

function released(closing: Released, held: Held): BookState {
  const connections = new Map(held.connections);
  connections.delete(closing.connection);
  const state = withoutCleanClose(closing);
  if (connections.size > NONE) {
    return withHeld({ ...closing, state }, { ...held, connections });
  }
  const clean = closing.state.closingCleanly.has(closing.connection) || isWebTab(held, closing.connection);
  const grace = Option.some({ clean, closedAt: closing.closedAt, closing: closing.connection });
  return withHeld({ ...closing, state }, { ...held, connections, grace });
}

function release(closing: Released): BookState {
  const held = heldBy(closing);
  if (!held.connections.has(closing.connection)) {
    return closing.state;
  }
  return released(closing, held);
}

function endGrace(closing: Closing): BookState {
  const held = heldBy(closing);
  const ending = Option.filter(
    held.grace,
    (grace) => grace.closing === closing.connection && held.connections.size === NONE,
  );
  return Option.match(ending, {
    onNone: () => closing.state,
    onSome: ({ clean, closedAt }) => {
      const lastSeen = new Map([...closing.state.lastSeen, [closing.identity, closedAt]]);
      const ended = { ...withHeld(closing, { ...held, grace: Option.none() }), lastSeen };
      if (clean) {
        return withEnd({ ...closing, state: ended }, CLEAN_CLOSE);
      }
      return withEnd({ ...closing, state: ended }, CONNECTION_LOST);
    },
  });
}

function endBootGrace(at: At): BookState {
  const ended = { ...at.state, onBootGrace: withoutBootGrace(at) };
  if (!at.state.onBootGrace.has(at.identity) || isLive(heldBy(at))) {
    return ended;
  }
  return withEnd({ ...at, state: ended }, CONNECTION_LOST);
}

function forget(at: At): BookState {
  const held = new Map(at.state.held);
  held.delete(at.identity);
  const lastSeen = new Map(at.state.lastSeen);
  lastSeen.delete(at.identity);
  const reach = new Map(at.state.reach);
  reach.delete(at.identity);
  return { ...at.state, ends: withoutEnd(at), held, lastSeen, onBootGrace: withoutBootGrace(at), reach };
}

function liveConnectionsIn(at: At): number {
  return heldBy(at).connections.size;
}

function heldAtStop(identity: IdentityName, state: BookState): readonly StoredPresence[] {
  return Option.match(heldBy({ identity, state }).grace, {
    onNone: () => [],
    onSome: ({ closedAt }) => [{ identity, lastSeenAt: closedAt, online: true }],
  });
}

function onlineAtStop(state: BookState): readonly StoredPresence[] {
  return Arr.flatMap([...state.held.keys()], (identity) => heldAtStop(identity, state));
}

export {
  type At,
  type BookState,
  type Closing,
  type Connection,
  type End,
  type Reach,
  type SentWith,
  connect,
  endBootGrace,
  endGrace,
  endIn,
  forget,
  heldBy,
  liveConnectionsIn,
  onlineAtStop,
  openBook,
  presenceIn,
  release,
  endedAs,
  heldAs,
  withoutBootGrace,
};
