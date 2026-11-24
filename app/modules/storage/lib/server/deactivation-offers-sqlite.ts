import type { ActivityRecords, DeactivationOffersSection, OfferSources } from "./deactivation-offers.ts";
import { Array as Arr, DateTime, Effect, Schema } from "effect";
import type {
  DeactivatedQuietAgentRecords,
  DeactivatedQuietAgentsSection,
  StoredDeactivatedQuietAgent,
} from "./deactivated-quiet-agents.ts";
import type { DialectForms, SqlDatabase } from "./adapters/sql-database.ts";
import { IsoTimeSchema, isoTimeOf } from "../../../time/server.ts";
import { boardOn, deactivationOffersOn } from "./deactivation-offers.ts";
import { deactivatedQuietAgentsOn, deactivatingWith } from "./deactivated-quiet-agents.ts";
import { isDeactivatedQuietAgentId, isDeactivationOfferId } from "../../../inbox/index.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { OfferRecord } from "./deactivation-offer-board.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const CLEARED = 1;
const OPEN = 0;
const READ = 1;
const UNREAD = 0;
const ONLY_ROW = 1;

const DEACTIVATION_OFFERS_MIGRATION = `CREATE TABLE activity (
     identity_name TEXT PRIMARY KEY,
     last_activity_at TEXT NOT NULL
   ) STRICT;
   CREATE TABLE activity_since (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     since TEXT NOT NULL
   ) STRICT;
   CREATE TABLE deactivation_offers (
     id INTEGER PRIMARY KEY,
     identity_name TEXT NOT NULL REFERENCES identities (name) ON DELETE CASCADE,
     recipients TEXT NOT NULL,
     raised_at TEXT NOT NULL,
     quiet_days INTEGER NOT NULL CHECK (quiet_days > 0),
     cleared INTEGER NOT NULL CHECK (cleared IN (0, 1))
   ) STRICT;`;

const DEACTIVATED_QUIET_AGENTS_MIGRATION = `CREATE TABLE deactivated_quiet_agents (
     id INTEGER PRIMARY KEY,
     identity_name TEXT NOT NULL REFERENCES identities (name) ON DELETE CASCADE,
     recipients TEXT NOT NULL,
     deactivated_at TEXT NOT NULL,
     read INTEGER NOT NULL CHECK (read IN (0, 1))
   ) STRICT;`;

const ENTRY_COLUMNS = "id, identity_name, recipients, deactivated_at, read";

const COLUMNS = "id, identity_name, recipients, raised_at, quiet_days, cleared";

const IdentityNameColumn = Schema.String.pipe(Schema.refine(isIdentityName));

const OfferRow = Schema.Struct({
  cleared: Schema.Literals([OPEN, CLEARED]),
  id: Schema.Int.pipe(Schema.refine(isDeactivationOfferId)),
  identity_name: IdentityNameColumn,
  quiet_days: Schema.Int,
  raised_at: IsoTimeSchema,
  recipients: Schema.fromJsonString(Schema.Array(IdentityNameColumn)),
});

const EntryRow = Schema.Struct({
  deactivated_at: IsoTimeSchema,
  id: Schema.Int.pipe(Schema.refine(isDeactivatedQuietAgentId)),
  identity_name: IdentityNameColumn,
  read: Schema.Literals([UNREAD, READ]),
  recipients: Schema.fromJsonString(Schema.Array(IdentityNameColumn)),
});

const ActivityRow = Schema.Struct({ identity_name: IdentityNameColumn, last_activity_at: IsoTimeSchema });

const RecipientsColumn = Schema.fromJsonString(Schema.Array(Schema.String));

const SinceRow = Schema.Struct({ since: IsoTimeSchema });

function offerRows(rows: readonly unknown[]): Fails<readonly OfferRecord[]> {
  return Schema.decodeUnknownEffect(Schema.Array(OfferRow))(rows).pipe(
    Effect.mapBoth({
      onFailure: unreadable,
      onSuccess: (decoded) =>
        Arr.map(
          decoded,
          (row): OfferRecord => ({
            cleared: row.cleared === CLEARED,
            id: row.id,
            identity: row.identity_name,
            quietDays: row.quiet_days,
            raisedAt: row.raised_at,
            recipients: row.recipients,
          }),
        ),
    }),
  );
}

function offerRow(row: unknown): Fails<OfferRecord> {
  return Effect.flatMap(offerRows([row]), (records) =>
    Effect.mapError(Effect.fromOption(Arr.head(records)), unreadable),
  );
}

function entryRows(rows: readonly unknown[]): Fails<readonly StoredDeactivatedQuietAgent[]> {
  return Schema.decodeUnknownEffect(Schema.Array(EntryRow))(rows).pipe(
    Effect.mapBoth({
      onFailure: unreadable,
      onSuccess: (decoded) =>
        Arr.map(
          decoded,
          (row): StoredDeactivatedQuietAgent => ({
            deactivatedAt: row.deactivated_at,
            id: row.id,
            identity: row.identity_name,
            read: row.read === READ,
            recipients: row.recipients,
          }),
        ),
    }),
  );
}

function entryRow(row: unknown): Fails<StoredDeactivatedQuietAgent> {
  return Effect.flatMap(entryRows([row]), (records) =>
    Effect.mapError(Effect.fromOption(Arr.head(records)), unreadable),
  );
}

function activityRows(rows: readonly unknown[]): Fails<ReadonlyMap<IdentityName, IsoTime>> {
  return Schema.decodeUnknownEffect(Schema.Array(ActivityRow))(rows).pipe(
    Effect.mapBoth({
      onFailure: unreadable,
      onSuccess: (decoded) => new Map(Arr.map(decoded, (row) => [row.identity_name, row.last_activity_at] as const)),
    }),
  );
}

const SINCE: DialectForms<string> = {
  postgres: `INSERT INTO activity_since (id, since) VALUES (${String(ONLY_ROW)}, ?) ON CONFLICT DO NOTHING`,
  sqlite: `INSERT OR IGNORE INTO activity_since (id, since) VALUES (${String(ONLY_ROW)}, ?)`,
};

interface OfferSql {
  readonly insert: string;
  readonly record: string;
  readonly clear: string;
  readonly insertEntry: string;
  readonly readEntry: string;
}

interface OfferSqlParts {
  readonly open: string;
  readonly cleared: string;
  readonly unread: string;
  readonly read: string;
  readonly latest: string;
}

function offerSql({ cleared, latest, open, read, unread }: OfferSqlParts): OfferSql {
  return {
    clear: `UPDATE deactivation_offers SET cleared = ${cleared} WHERE id = ?`,
    insert: `INSERT INTO deactivation_offers (identity_name, recipients, raised_at, quiet_days, cleared)
  VALUES (?, ?, ?, ?, ${open}) RETURNING ${COLUMNS}`,
    insertEntry: `INSERT INTO deactivated_quiet_agents (identity_name, recipients, deactivated_at, read)
  VALUES (?, ?, ?, ${unread}) RETURNING ${ENTRY_COLUMNS}`,
    readEntry: `UPDATE deactivated_quiet_agents SET read = ${read} WHERE id = ?`,
    record: `INSERT INTO activity (identity_name, last_activity_at) VALUES (?, ?)
  ON CONFLICT (identity_name) DO UPDATE SET last_activity_at = ${latest}`,
  };
}

const OFFER_SQL: DialectForms<OfferSql> = {
  postgres: offerSql({
    cleared: "TRUE",
    latest: "greatest(activity.last_activity_at, excluded.last_activity_at)",
    open: "FALSE",
    read: "TRUE",
    unread: "FALSE",
  }),
  sqlite: offerSql({
    cleared: String(CLEARED),
    latest: "max(last_activity_at, excluded.last_activity_at)",
    open: String(OPEN),
    read: String(READ),
    unread: String(UNREAD),
  }),
};

function sqlDeactivatedQuietAgentRecords(db: SqlDatabase): DeactivatedQuietAgentRecords {
  return {
    deactivatedQuietAgents: Effect.flatMap(
      db.all(`SELECT ${ENTRY_COLUMNS} FROM deactivated_quiet_agents ORDER BY id`),
      entryRows,
    ),
    insert: ({ deactivatedAt, identity, recipients }) =>
      Schema.encodeEffect(RecipientsColumn)(recipients).pipe(
        Effect.mapError(unreadable),
        Effect.flatMap((encoded) => db.get(OFFER_SQL[db.dialect].insertEntry, identity, encoded, deactivatedAt)),
        Effect.flatMap(entryRow),
      ),
    markRead: (ids) =>
      Effect.forEach(ids, (id) => db.run(OFFER_SQL[db.dialect].readEntry, id), { concurrency: 1, discard: true }),
  };
}

function sinceOn(db: SqlDatabase): Fails<IsoTime> {
  return Effect.gen(function* beginActivity() {
    const now = yield* DateTime.now;
    yield* db.run(SINCE[db.dialect], isoTimeOf(now));
    const row = yield* db.get("SELECT since FROM activity_since");
    return yield* Schema.decodeUnknownEffect(SinceRow)(row).pipe(
      Effect.mapBoth({ onFailure: unreadable, onSuccess: ({ since }) => since }),
    );
  });
}

function sqlActivityRecords(db: SqlDatabase, since: IsoTime): ActivityRecords {
  return {
    activity: Effect.flatMap(db.all("SELECT identity_name, last_activity_at FROM activity"), activityRows),
    clear: (ids) =>
      Effect.forEach(ids, (id) => db.run(OFFER_SQL[db.dialect].clear, id), { concurrency: 1, discard: true }),
    insert: ({ identity, quietDays, raisedAt, recipients }) =>
      Schema.encodeEffect(RecipientsColumn)(recipients).pipe(
        Effect.mapError(unreadable),
        Effect.flatMap((encoded) => db.get(OFFER_SQL[db.dialect].insert, identity, encoded, raisedAt, quietDays)),
        Effect.flatMap(offerRow),
      ),
    offers: Effect.flatMap(db.all(`SELECT ${COLUMNS} FROM deactivation_offers ORDER BY id`), offerRows),
    recordActivity: (identity, at) => db.run(OFFER_SQL[db.dialect].record, identity, at),
    since: Effect.succeed(since),
  };
}

interface SqlSources {
  readonly db: SqlDatabase;
  readonly sources: OfferSources;
}

function sqlDeactivationOffers({
  db,
  sources,
}: SqlSources): Fails<DeactivationOffersSection & DeactivatedQuietAgentsSection> {
  return Effect.map(sinceOn(db), (since) => {
    const on = { atomically: db.transaction, records: sqlActivityRecords(db, since), sources };
    return {
      ...deactivationOffersOn(on),
      ...deactivatedQuietAgentsOn({
        board: boardOn(on),
        deactivate: deactivatingWith(sources.deactivateIdentity),
        records: sqlDeactivatedQuietAgentRecords(db),
      }),
    };
  });
}

export { DEACTIVATED_QUIET_AGENTS_MIGRATION, DEACTIVATION_OFFERS_MIGRATION, sqlDeactivationOffers };
