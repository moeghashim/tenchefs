import { Array as Arr, Effect, Order, Predicate, Schema } from "effect";
import type { Message, MessageId, ReadReceipt } from "../../../messages/index.ts";
import type { IdentityName } from "../../../identities/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { ReadPosition } from "../../../inbox/index.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { isMessageId } from "../../../messages/index.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const ONE_AT_A_TIME = { concurrency: 1 } as const;

const byMessageThenIdentity: Order.Order<ReadReceipt> = Order.combine(
  Order.mapInput(Order.Number, (receipt: ReadReceipt) => receipt.messageId),
  Order.mapInput(Order.String, (receipt: ReadReceipt) => receipt.identity),
);

function receiptIdentitySql(who: string): string {
  return `m.author_name <> ${who}
    AND (EXISTS (SELECT 1 FROM message_mentions AS mm WHERE mm.message_id = m.id AND mm.identity_name = ${who})
      OR (m.reply_to IS NOT NULL AND (SELECT p.author_name FROM messages AS p WHERE p.id = m.reply_to) = ${who}))`;
}

const BACKFILL_READ_RECEIPTS = `INSERT OR IGNORE INTO read_receipts (message_id, identity_name, seen_at)
  SELECT m.id, c.identity_name, NULL FROM channel_read_positions AS c
    JOIN messages AS m ON m.channel = c.channel AND m.reply_to IS NULL AND m.id <= c.message_id
    WHERE ${receiptIdentitySql("c.identity_name")}
  UNION ALL SELECT m.id, t.identity_name, NULL FROM thread_read_positions AS t
    JOIN messages AS m ON m.reply_to = t.thread_id AND m.id <= t.message_id
    WHERE ${receiptIdentitySql("t.identity_name")};`;

const READ_RECEIPTS_MIGRATION = `CREATE TABLE read_receipts (
     message_id INTEGER NOT NULL REFERENCES messages (id),
     identity_name TEXT NOT NULL,
     seen_at TEXT,
     PRIMARY KEY (message_id, identity_name)
   ) STRICT, WITHOUT ROWID;
   ${BACKFILL_READ_RECEIPTS}`;

const RECORD_IN_CHANNEL = `INSERT INTO read_receipts (message_id, identity_name, seen_at)
  SELECT m.id, ?1, ?4 FROM messages AS m
  WHERE m.channel = ?2 AND m.reply_to IS NULL AND m.id <= ?3 AND ${receiptIdentitySql("?1")}
  ON CONFLICT DO NOTHING RETURNING message_id, identity_name, seen_at`;

const RECORD_IN_THREAD = `INSERT INTO read_receipts (message_id, identity_name, seen_at)
  SELECT m.id, ?1, ?4 FROM messages AS m
  WHERE m.reply_to = ?2 AND m.id <= ?3 AND ${receiptIdentitySql("?1")}
  ON CONFLICT DO NOTHING RETURNING message_id, identity_name, seen_at`;

const ReceiptRow = Schema.Struct({
  identity_name: Schema.String.pipe(Schema.refine(isIdentityName)),
  message_id: Schema.Int.pipe(Schema.refine(isMessageId)),
  seen_at: Schema.NullOr(IsoTimeSchema),
});

function receiptRow(row: unknown): Fails<ReadReceipt> {
  return Schema.decodeUnknownEffect(ReceiptRow)(row).pipe(
    Effect.mapBoth({
      onFailure: unreadable,
      onSuccess: ({ identity_name: identity, message_id: messageId, seen_at: seenAt }): ReadReceipt => {
        if (Predicate.isNull(seenAt)) {
          return { identity, messageId, seen: true };
        }
        return { identity, messageId, seen: true, seenAt };
      },
    }),
  );
}

function receiptRows(rows: readonly unknown[]): Fails<readonly ReadReceipt[]> {
  return Effect.map(Effect.forEach(rows, receiptRow, ONE_AT_A_TIME), (receipts: readonly ReadReceipt[]) =>
    Arr.sort(receipts, byMessageThenIdentity),
  );
}

interface Recording {
  readonly at: Message["createdAt"];
  readonly db: SqlDatabase;
  readonly identity: IdentityName;
  readonly position: ReadPosition;
}

function recordReceiptsIn({ at, db, identity, position }: Recording): Fails<readonly ReadReceipt[]> {
  const { channel, messageId, thread } = position;
  if (Predicate.isNull(thread)) {
    return Effect.flatMap(db.all(RECORD_IN_CHANNEL, identity, channel, messageId, at), receiptRows);
  }
  return Effect.flatMap(db.all(RECORD_IN_THREAD, identity, thread, messageId, at), receiptRows);
}

interface Listing {
  readonly db: SqlDatabase;
  readonly ids: readonly MessageId[];
}

function receiptsOf({ db, ids }: Listing): Fails<readonly ReadReceipt[]> {
  if (Arr.isReadonlyArrayEmpty(ids)) {
    return Effect.succeed([]);
  }
  const places = Arr.join(
    Arr.map(ids, () => "?"),
    ", ",
  );
  return Effect.flatMap(
    db.all(`SELECT message_id, identity_name, seen_at FROM read_receipts WHERE message_id IN (${places})`, ...ids),
    receiptRows,
  );
}

export { READ_RECEIPTS_MIGRATION, receiptsOf, recordReceiptsIn };
