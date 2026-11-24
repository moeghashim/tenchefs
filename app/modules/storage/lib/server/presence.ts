import { Array as Arr, Effect, Option, Order, Predicate, Schema, String as Str } from "effect";
import type { DialectForms, SqlDatabase } from "./adapters/sql-database.ts";
import type { Fails } from "./errors.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { MemoryState } from "./memory-state.ts";
import type { OfflineReason } from "../../../presence/index.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { offlineReasons } from "../../../presence/index.ts";
import { unreadable } from "./errors.ts";

interface StoredPresence {
  readonly identity: IdentityName;
  readonly online: boolean;
  readonly lastSeenAt: IsoTime;
  readonly offlineReason?: OfflineReason;
  readonly endedUnexpectedly?: boolean;
}

interface PresenceSection {
  readonly recordPresence: (presence: StoredPresence) => Fails<void>;
  readonly listPresence: (identities: readonly IdentityName[]) => Fails<readonly StoredPresence[]>;
}

const ONLINE = 1;
const OFFLINE = 0;
const NO = 0;
const YES = 1;

const PresenceRow = Schema.Struct({
  ended_unexpectedly: Schema.NullOr(Schema.Literals([NO, YES])),
  identity_name: Schema.String.pipe(Schema.refine(isIdentityName)),
  last_seen_at: IsoTimeSchema,
  offline_reason: Schema.NullOr(Schema.Literals(offlineReasons)),
  online: Schema.Literals([OFFLINE, ONLINE]),
});

const byIdentity = Order.mapInput(Str.Order, (presence: StoredPresence) => presence.identity);

function onlineColumn(online: boolean): number {
  if (online) {
    return ONLINE;
  }
  return OFFLINE;
}

type MemoryPresenceSection = PresenceSection & {
  readonly dropPresence: (identity: IdentityName) => Effect.Effect<void>;
};

function memoryPresence(state: MemoryState): MemoryPresenceSection {
  const kept = new Map<IdentityName, StoredPresence>();
  return {
    dropPresence: (identity) =>
      Effect.sync(() => {
        kept.delete(identity);
      }),
    listPresence: (identities) =>
      Effect.andThen(
        state.ensureOpen,
        Effect.sync(() =>
          Arr.sort(
            Arr.flatMap(identities, (identity) => Option.toArray(Option.fromNullishOr(kept.get(identity)))),
            byIdentity,
          ),
        ),
      ),
    recordPresence: (presence) =>
      Effect.andThen(
        state.ensureOpen,
        Effect.sync(() => {
          kept.set(presence.identity, { ...presence });
        }),
      ),
  };
}

function decodeRows(rows: readonly unknown[]): Fails<readonly (typeof PresenceRow.Type)[]> {
  return Schema.decodeUnknownEffect(Schema.Array(PresenceRow))(rows).pipe(Effect.mapError(unreadable));
}

function yesOrNo(value: boolean | undefined): number | null {
  if (Predicate.isUndefined(value)) {
    return null;
  }
  if (value) {
    return YES;
  }
  return NO;
}

function endOf(row: typeof PresenceRow.Type): Pick<StoredPresence, "endedUnexpectedly" | "offlineReason"> {
  const reason = Option.fromNullishOr(row.offline_reason);
  const unexpected = Option.fromNullishOr(row.ended_unexpectedly);
  return {
    ...Option.match(reason, { onNone: () => ({}), onSome: (offlineReason) => ({ offlineReason }) }),
    ...Option.match(unexpected, { onNone: () => ({}), onSome: (flag) => ({ endedUnexpectedly: flag === YES }) }),
  };
}

function storedPresenceOf(row: typeof PresenceRow.Type): StoredPresence {
  return { identity: row.identity_name, lastSeenAt: row.last_seen_at, online: row.online === ONLINE, ...endOf(row) };
}

function placeholders(identities: readonly IdentityName[]): string {
  return Arr.join(
    Arr.map(identities, () => "?"),
    ", ",
  );
}

const NO_NAME = "NULL";

function postgresPlaceholders(identities: readonly IdentityName[]): string {
  if (Arr.isReadonlyArrayNonEmpty(identities)) {
    return placeholders(identities);
  }
  return NO_NAME;
}

const PLACES: DialectForms<(identities: readonly IdentityName[]) => string> = {
  postgres: postgresPlaceholders,
  sqlite: placeholders,
};

function sqlPresence(db: SqlDatabase): PresenceSection {
  return {
    listPresence: (identities) =>
      db
        .all(
          `SELECT * FROM presence WHERE identity_name IN (${PLACES[db.dialect](identities)}) ORDER BY identity_name`,
          ...identities,
        )
        .pipe(Effect.flatMap(decodeRows), Effect.map(Arr.map(storedPresenceOf))),
    recordPresence: ({ endedUnexpectedly, identity, lastSeenAt, offlineReason, online }) =>
      db.run(
        `INSERT INTO presence (identity_name, online, last_seen_at, offline_reason, ended_unexpectedly)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (identity_name) DO UPDATE SET online = excluded.online, last_seen_at = excluded.last_seen_at,
           offline_reason = excluded.offline_reason, ended_unexpectedly = excluded.ended_unexpectedly`,
        identity,
        onlineColumn(online),
        lastSeenAt,
        offlineReason ?? null,
        yesOrNo(endedUnexpectedly),
      ),
  };
}

export { type PresenceSection, type StoredPresence, memoryPresence, sqlPresence };
