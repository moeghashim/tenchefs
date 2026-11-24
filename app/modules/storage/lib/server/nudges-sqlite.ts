import { DateTime, Effect, Schema } from "effect";
import type { DialectForms, SqlDatabase } from "./adapters/sql-database.ts";
import { FALSE, TRUE } from "./adapters/sql-database.ts";
import { IsoTimeSchema, isoTimeOf } from "../../../time/server.ts";
import type { NudgeRecord, NudgeRecords, NudgeSources, NudgesSection } from "./nudges.ts";
import { isNudgeId, nudgeKinds } from "../../../inbox/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { isMessageId } from "../../../messages/index.ts";
import { nudgesOn } from "./nudges.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const READ = 1;
const UNREAD = 0;

const NUDGES_MIGRATION = `CREATE TABLE nudges (
     id INTEGER PRIMARY KEY,
     thread INTEGER NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
     recipient TEXT REFERENCES identities (name) ON DELETE CASCADE,
     kind TEXT NOT NULL CHECK (kind IN ('first', 'second')),
     raised_at TEXT NOT NULL,
     read INTEGER NOT NULL CHECK (read IN (0, 1))
   ) STRICT;
   CREATE INDEX nudges_by_recipient ON nudges (recipient, id);
   CREATE INDEX nudges_by_thread ON nudges (thread, id);
   CREATE TABLE nudges_since (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     since TEXT NOT NULL
   ) STRICT;`;

const COLUMNS = "id, thread, recipient, kind, raised_at, read";

const IdentityNameColumn = Schema.String.pipe(Schema.refine(isIdentityName));

const NudgeRow = Schema.Struct({
  id: Schema.Int.pipe(Schema.refine(isNudgeId)),
  kind: Schema.Literals(nudgeKinds),
  raised_at: IsoTimeSchema,
  read: Schema.Literals([UNREAD, READ]),
  recipient: Schema.NullOr(IdentityNameColumn),
  thread: Schema.Int.pipe(Schema.refine(isMessageId)),
});

const SinceRow = Schema.Struct({ since: IsoTimeSchema });

function nudgeRow(row: unknown): Fails<NudgeRecord> {
  return Schema.decodeUnknownEffect(NudgeRow)(row).pipe(
    Effect.mapBoth({
      onFailure: unreadable,
      onSuccess: (decoded): NudgeRecord => ({
        id: decoded.id,
        kind: decoded.kind,
        raisedAt: decoded.raised_at,
        read: decoded.read === READ,
        recipient: decoded.recipient,
        thread: decoded.thread,
      }),
    }),
  );
}

function nudgeRows(rows: readonly unknown[]): Fails<readonly NudgeRecord[]> {
  return Effect.forEach(rows, nudgeRow, ONE_AT_A_TIME);
}

const ONLY_ROW = 1;
const SINCE: DialectForms<string> = {
  postgres: `INSERT INTO nudges_since (id, since) VALUES (${String(ONLY_ROW)}, ?) ON CONFLICT DO NOTHING`,
  sqlite: `INSERT OR IGNORE INTO nudges_since (id, since) VALUES (${String(ONLY_ROW)}, ?)`,
};

function insertSql(dialect: SqlDatabase["dialect"]): string {
  return `INSERT INTO nudges (thread, recipient, kind, raised_at, read) VALUES (?, ?, ?, ?, ${FALSE[dialect]}) RETURNING ${COLUMNS}`;
}

const INSERT: DialectForms<string> = { postgres: insertSql("postgres"), sqlite: insertSql("sqlite") };
const LATEST = `SELECT ${COLUMNS} FROM nudges WHERE id IN (SELECT max(id) FROM nudges GROUP BY thread)`;

function markReadSql(dialect: SqlDatabase["dialect"]): string {
  return `UPDATE nudges SET read = ${TRUE[dialect]} WHERE recipient = ? AND id = ?`;
}

const MARK_READ: DialectForms<string> = { postgres: markReadSql("postgres"), sqlite: markReadSql("sqlite") };
const OF_RECIPIENT = `SELECT ${COLUMNS} FROM nudges WHERE recipient = ? ORDER BY id`;

function decodeSince(row: unknown): Fails<IsoTime> {
  return Schema.decodeUnknownEffect(SinceRow)(row).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: ({ since }) => since }),
  );
}

function sinceOn(db: SqlDatabase): Fails<IsoTime> {
  return Effect.gen(function* beginNudges() {
    const now = yield* DateTime.now;
    yield* db.run(SINCE[db.dialect], isoTimeOf(now));
    return yield* Effect.flatMap(db.get("SELECT since FROM nudges_since"), decodeSince);
  });
}

function sqlRecords(db: SqlDatabase, since: IsoTime): NudgeRecords {
  return {
    insert: ({ kind, raisedAt, recipient, thread }) =>
      Effect.flatMap(db.get(INSERT[db.dialect], thread, recipient, kind, raisedAt), nudgeRow),
    latestPerThread: Effect.flatMap(db.all(LATEST), nudgeRows),
    markRead: (recipient, ids) =>
      Effect.forEach(ids, (id) => db.run(MARK_READ[db.dialect], recipient, id), { concurrency: 1, discard: true }),
    ofRecipient: (recipient) => Effect.flatMap(db.all(OF_RECIPIENT, recipient), nudgeRows),
    since: Effect.succeed(since),
  };
}

interface SqlSources {
  readonly db: SqlDatabase;
  readonly sources: NudgeSources;
}

function sqlNudges({ db, sources }: SqlSources): Fails<NudgesSection> {
  return Effect.map(sinceOn(db), (since) =>
    nudgesOn({ atomically: db.transaction, identities: sources, messages: sources, records: sqlRecords(db, since) }),
  );
}

export { NUDGES_MIGRATION, sqlNudges };
