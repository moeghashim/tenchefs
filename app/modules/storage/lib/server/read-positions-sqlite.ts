import type { AckedInbox, AckedMessage, Scope } from "./inbox.ts";
import { Array as Arr, Effect, Option, Predicate, Schema } from "effect";
import type { DialectForms, SqlDatabase } from "./adapters/sql-database.ts";
import type { Message, MessageId } from "../../../messages/index.ts";
import type { MovedBackReadPosition, ReadPosition } from "../../../inbox/index.ts";
import { movedBackTo, scopeOf } from "./inbox.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isChannelName } from "../../../channels/index.ts";
import { isFalse } from "./adapters/sql-database.ts";
import { isMessageId } from "../../../messages/index.ts";
import { recordReceiptsIn } from "./read-receipts-sqlite.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const MessageIdColumn = Schema.Int.pipe(Schema.refine(isMessageId));

const READ_POSITIONS = `SELECT channel, NULL AS thread_id, message_id FROM channel_read_positions
    WHERE identity_name = ?1
  UNION ALL SELECT messages.channel, t.thread_id, t.message_id
    FROM thread_read_positions AS t JOIN messages ON messages.id = t.thread_id WHERE t.identity_name = ?1
  ORDER BY channel, thread_id NULLS FIRST`;

const ReadPositionRow = Schema.Struct({
  channel: Schema.String.pipe(Schema.refine(isChannelName)),
  message_id: MessageIdColumn,
  thread_id: Schema.NullOr(MessageIdColumn),
});

const MaybeIdRow = Schema.UndefinedOr(Schema.Struct({ message_id: Schema.NullOr(MessageIdColumn) }));

interface ScopeSql {
  readonly current: string;
  readonly previous: string;
  readonly set: string;
  readonly clear: string;
}

const CHANNEL_SQL: ScopeSql = {
  clear: "DELETE FROM channel_read_positions WHERE identity_name = ?1 AND channel = ?2",
  current: "SELECT message_id FROM channel_read_positions WHERE identity_name = ?1 AND channel = ?2",
  previous: "SELECT max(id) AS message_id FROM messages WHERE channel = ?1 AND reply_to IS NULL AND id < ?2",
  set: "UPDATE channel_read_positions SET message_id = ?3 WHERE identity_name = ?1 AND channel = ?2",
};

const THREAD_SQL: ScopeSql = {
  clear: "DELETE FROM thread_read_positions WHERE identity_name = ?1 AND thread_id = ?2",
  current: "SELECT message_id FROM thread_read_positions WHERE identity_name = ?1 AND thread_id = ?2",
  previous: "SELECT max(id) AS message_id FROM messages WHERE reply_to = ?1 AND id < ?2",
  set: "UPDATE thread_read_positions SET message_id = ?3 WHERE identity_name = ?1 AND thread_id = ?2",
};

function maybeId(row: unknown): Fails<MessageId | undefined> {
  return Schema.decodeUnknownEffect(MaybeIdRow)(row).pipe(
    Effect.mapBoth({
      onFailure: unreadable,
      onSuccess: (decoded) =>
        Option.getOrUndefined(Option.flatMapNullishOr(Option.fromUndefinedOr(decoded), (found) => found.message_id)),
    }),
  );
}

function sqlOf(scope: Scope): ScopeSql {
  if (Predicate.isNull(scope.thread)) {
    return CHANNEL_SQL;
  }
  return THREAD_SQL;
}

function savePosition(db: SqlDatabase, identity: IdentityName, position: MovedBackReadPosition): Fails<void> {
  const sql = sqlOf(position);
  const key = position.thread ?? position.channel;
  if (Predicate.isNull(position.messageId)) {
    return db.run(sql.clear, identity, key);
  }
  return db.run(sql.set, identity, key, position.messageId);
}

interface MovingBack extends Reading {
  readonly message: Message;
}

function moveReadPositionBackIn({ db, identity, message }: MovingBack): Fails<MovedBackReadPosition> {
  return Effect.gen(function* moveBack() {
    const scope = scopeOf(message);
    const sql = sqlOf(scope);
    const key = scope.thread ?? scope.channel;
    const current = yield* Effect.flatMap(db.get(sql.current, identity, key), maybeId);
    const previous = yield* Effect.flatMap(db.get(sql.previous, key, message.id), maybeId);
    const position = movedBackTo({ current, message, previous });
    yield* savePosition(db, identity, position);
    return position;
  });
}

function readPositionRow(row: unknown): Fails<ReadPosition> {
  return Schema.decodeUnknownEffect(ReadPositionRow)(row).pipe(
    Effect.mapBoth({
      onFailure: unreadable,
      onSuccess: (decoded) => ({ channel: decoded.channel, messageId: decoded.message_id, thread: decoded.thread_id }),
    }),
  );
}

interface Reading {
  readonly db: SqlDatabase;
  readonly identity: IdentityName;
}

function readPositionsIn({ db, identity }: Reading): Fails<readonly ReadPosition[]> {
  return db
    .all(READ_POSITIONS, identity)
    .pipe(Effect.flatMap((rows) => Effect.forEach(rows, readPositionRow, ONE_AT_A_TIME)));
}

interface MoveSql {
  readonly channel: string;
  readonly thread: string;
}

function moveSql(greatest: string): MoveSql {
  return {
    channel: `INSERT INTO channel_read_positions (identity_name, channel, message_id) VALUES (?, ?, ?)
  ON CONFLICT (identity_name, channel) DO UPDATE SET message_id = ${greatest}(channel_read_positions.message_id, excluded.message_id)
  RETURNING message_id`,
    thread: `INSERT INTO thread_read_positions (identity_name, thread_id, message_id) VALUES (?, ?, ?)
  ON CONFLICT (identity_name, thread_id) DO UPDATE SET message_id = ${greatest}(thread_read_positions.message_id, excluded.message_id)
  RETURNING message_id`,
  };
}

const MOVE_SQL: DialectForms<MoveSql> = { postgres: moveSql("greatest"), sqlite: moveSql("max") };

const PositionRow = Schema.Struct({ message_id: MessageIdColumn });

function positionRow(row: unknown): Fails<MessageId> {
  return Schema.decodeUnknownEffect(PositionRow)(row).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: (decoded) => decoded.message_id }),
  );
}

interface Acking extends Reading {
  readonly at: Message["createdAt"];
  readonly message: Message;
}

function movePosition({ db, identity, message }: Acking, scope: Scope): Fails<unknown> {
  if (Predicate.isNull(scope.thread)) {
    return db.get(MOVE_SQL[db.dialect].channel, identity, scope.channel, message.id);
  }
  return db.get(MOVE_SQL[db.dialect].thread, identity, scope.thread, message.id);
}

function ackIn(acking: Acking): Fails<AckedMessage> {
  return Effect.gen(function* moveAndRecord() {
    const scope = scopeOf(acking.message);
    const messageId = yield* Effect.flatMap(movePosition(acking, scope), positionRow);
    const readPosition = { ...scope, messageId };
    const receipts = yield* recordReceiptsIn({ ...acking, position: readPosition });
    return { readPosition, receipts };
  });
}

function seenInChannelSql(db: SqlDatabase): string {
  return `UPDATE reactions SET seen = TRUE WHERE ${isFalse[db.dialect]("seen")} AND message_id IN
  (SELECT id FROM messages WHERE author_name = ?1 AND channel = ?2 AND reply_to IS NULL AND id <= ?3)`;
}

function seenInThreadSql(db: SqlDatabase): string {
  return `UPDATE reactions SET seen = TRUE WHERE ${isFalse[db.dialect]("seen")} AND message_id IN
  (SELECT id FROM messages WHERE author_name = ?1 AND reply_to = ?2 AND id <= ?3)`;
}

function reactionsSeenUpTo({ db, identity, message }: Acking): Fails<void> {
  const { channel, thread } = scopeOf(message);
  if (Predicate.isNull(thread)) {
    return db.run(seenInChannelSql(db), identity, channel, message.id);
  }
  return db.run(seenInThreadSql(db), identity, thread, message.id);
}

function ackMessageIn(acking: Acking): Fails<AckedMessage> {
  return Effect.tap(ackIn(acking), () => reactionsSeenUpTo(acking));
}

interface AckingAll extends Reading {
  readonly at: Message["createdAt"];
  readonly messages: readonly Message[];
}

function ackAllIn({ messages, ...acking }: AckingAll): Fails<AckedInbox> {
  return Effect.map(
    Effect.forEach(messages, (message) => ackIn({ ...acking, message }), ONE_AT_A_TIME),
    (acked: readonly AckedMessage[]) => ({
      readPositions: Arr.map(acked, (one) => one.readPosition),
      receipts: Arr.flatMap(acked, (one) => one.receipts),
    }),
  );
}

export { ackAllIn, ackIn, ackMessageIn, moveReadPositionBackIn, readPositionsIn };
export { receiptsOf } from "./read-receipts-sqlite.ts";
