import { Array as Arr, Effect, Option, Predicate, Schema } from "effect";
import { CHANNEL_COLUMNS, toChannel } from "./channels.ts";
import type {
  HistoryPageRequest,
  InboxSection,
  StoredHistoryItem,
  StoredHistoryPage,
  StoredInboxItem,
} from "./inbox.ts";
import type { Message, MessageId, ReadReceipt, TopLevelMessage } from "../../../messages/index.ts";
import {
  ackAllIn,
  ackIn,
  ackMessageIn,
  moveReadPositionBackIn,
  readPositionsIn,
  receiptsOf,
} from "./read-positions-sqlite.ts";
import { followersOf, newestPerScope, reasonsIn } from "./inbox.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { InboxReason } from "../../../inbox/index.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { inboxReasons } from "../../../inbox/index.ts";
import { isFalse } from "./adapters/sql-database.ts";
import { threadIdOf } from "./messages.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface MessageReader {
  readonly findMessage: (id: MessageId) => Fails<Message | undefined>;
  readonly toMessage: (row: unknown) => Fails<Message>;
  readonly columns: string;
}

interface Appended {
  readonly db: SqlDatabase;
  readonly message: Message;
}

interface InboxOn {
  readonly db: SqlDatabase;
  readonly reader: MessageReader;
}

interface Reasoned {
  readonly message: Message;
  readonly read: boolean;
  readonly reasons: readonly InboxReason[];
}

const ONE_AT_A_TIME = { concurrency: 1 } as const;

const FOLLOW = "INSERT INTO follows (identity_name, thread_id) VALUES (?, ?) ON CONFLICT DO NOTHING";

const READ = 1;
const UNREAD = 0;
const ALL_IDS = Number.MAX_SAFE_INTEGER;
const ONE_MORE = 1;
const ReasonRow = Schema.Struct({ read: Schema.Literals([UNREAD, READ]), reason: Schema.Literals(inboxReasons) });
const FOUND = 1;
const NOTHING_SEEN = 0;
const isFoundRow = Schema.is(Schema.Struct({ found: Schema.Literal(FOUND) }));

const MARKER = `coalesce(CASE WHEN messages.reply_to IS NULL
    THEN (SELECT c.message_id FROM channel_read_positions AS c
      WHERE c.identity_name = ?1 AND c.channel = messages.channel)
    ELSE (SELECT t.message_id FROM thread_read_positions AS t
      WHERE t.identity_name = ?1 AND t.thread_id = messages.reply_to) END, 0)`;

const REASONS = `SELECT m.id AS id, 'followed-thread' AS reason
    FROM follows AS f JOIN messages AS m ON m.reply_to = f.thread_id WHERE f.identity_name = ?1
  UNION ALL SELECT m.id, 'mention'
    FROM message_mentions AS mm JOIN messages AS m ON m.id = mm.message_id WHERE mm.identity_name = ?1
  UNION ALL SELECT m.id, 'subscribed-channel'
    FROM subscriptions AS s JOIN messages AS m ON m.channel = s.channel AND m.reply_to IS NULL
    WHERE s.identity_name = ?1`;

function inboxSql(columns: string, ids: "messages.id > ?2" | "messages.id = ?2"): string {
  return `WITH reasons (id, reason) AS (${REASONS})
    SELECT ${columns}, reasons.reason AS reason, ${UNREAD} AS read FROM messages JOIN reasons USING (id)
    WHERE messages.author_name <> ?1 AND ${ids} AND messages.id > ${MARKER}
    ORDER BY messages.id, reasons.reason`;
}

const REACTED = `SELECT DISTINCT r.message_id AS id, 'reaction' AS reason
    FROM reactions AS r JOIN messages AS m ON m.id = r.message_id
    WHERE m.author_name = ?1 AND r.identity_name <> ?1`;

function seenReactionsSql(db: SqlDatabase): string {
  return `NOT EXISTS (SELECT 1 FROM reactions AS u
    WHERE u.message_id = messages.id AND ${isFalse[db.dialect]("u.seen")} AND u.identity_name <> ?1)`;
}

function historySql(db: SqlDatabase, columns: string): string {
  return `WITH reasons (id, reason) AS (${REASONS}),
    listed (id, reason) AS (SELECT reasons.id, reasons.reason FROM reasons JOIN messages USING (id)
      WHERE messages.author_name <> ?1 UNION ALL ${REACTED}),
    page (id) AS (SELECT DISTINCT id FROM listed WHERE id < ?2 ORDER BY id DESC LIMIT ?3)
    SELECT ${columns}, listed.reason AS reason,
      CASE WHEN listed.reason = 'reaction' THEN ${seenReactionsSql(db)} ELSE messages.id <= ${MARKER} END AS read
    FROM messages JOIN page USING (id) JOIN listed USING (id)
    ORDER BY messages.id DESC, listed.reason`;
}

function recordAppended({ db, message }: Appended): Fails<readonly ReadReceipt[]> {
  return Effect.gen(function* recordMentionsAndFollows() {
    const thread = threadIdOf(message);
    yield* Effect.forEach(
      message.mentions,
      (name) =>
        db.run(
          "INSERT INTO message_mentions (identity_name, message_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
          name,
          message.id,
        ),
      ONE_AT_A_TIME,
    );
    yield* Effect.forEach(followersOf(message), (name) => db.run(FOLLOW, name, thread), ONE_AT_A_TIME);
    const { receipts } = yield* ackIn({ at: message.createdAt, db, identity: message.author.name, message });
    return receipts;
  });
}

function reasonedRow(reader: MessageReader, row: unknown): Fails<Reasoned> {
  return Effect.gen(function* readReasonedRow() {
    const message = yield* reader.toMessage(row);
    const { read, reason } = yield* Schema.decodeUnknownEffect(ReasonRow)(row).pipe(Effect.mapError(unreadable));
    return { message, read: read === READ, reasons: [reason] };
  });
}

function grouped(rows: readonly Reasoned[]): readonly Reasoned[] {
  const ids = Arr.dedupe(Arr.map(rows, (row) => row.message.id));
  return Arr.flatMap(ids, (id) => {
    const same = Arr.filter(rows, (row) => row.message.id === id);
    const reasons = reasonsIn(Arr.flatMap(same, (row) => row.reasons));
    return Option.toArray(Option.map(Arr.head(same), ({ message, read }) => ({ message, read, reasons })));
  });
}

function withParent(reader: MessageReader, { message, read, reasons }: Reasoned): Fails<StoredHistoryItem> {
  return reader.findMessage(threadIdOf(message)).pipe(
    Effect.filterOrFail(
      (parent): parent is TopLevelMessage => Predicate.isNotUndefined(parent) && parent.kind === "top-level",
      unreadable,
    ),
    Effect.map((parent): StoredHistoryItem => {
      if (message.kind === "top-level") {
        return { message: parent, parent, read, reasons };
      }
      return { message, parent, read, reasons };
    }),
  );
}

function itemsOf(reader: MessageReader, rows: readonly unknown[]): Fails<readonly StoredHistoryItem[]> {
  return Effect.gen(function* readItems() {
    const reasoned = yield* Effect.forEach(rows, (row) => reasonedRow(reader, row), ONE_AT_A_TIME);
    return yield* Effect.forEach(grouped(reasoned), (item) => withParent(reader, item), ONE_AT_A_TIME);
  });
}

function inboxItemsOf(reader: MessageReader, rows: readonly unknown[]): Fails<readonly StoredInboxItem[]> {
  return Effect.map(
    itemsOf(reader, rows),
    Arr.map(({ message, parent, reasons }): StoredInboxItem => ({ message, parent, reasons })),
  );
}

function inboxOf(
  { db, reader }: InboxOn,
  identity: IdentityName,
  after: MessageId | typeof NOTHING_SEEN,
): Fails<readonly StoredInboxItem[]> {
  return Effect.flatMap(db.all(inboxSql(reader.columns, "messages.id > ?2"), identity, after), (rows) =>
    inboxItemsOf(reader, rows),
  );
}

function inboxItemOf(
  { db, reader }: InboxOn,
  identity: IdentityName,
  id: MessageId,
): Fails<StoredInboxItem | undefined> {
  return db.all(inboxSql(reader.columns, "messages.id = ?2"), identity, id).pipe(
    Effect.flatMap((rows) => inboxItemsOf(reader, rows)),
    Effect.map((items) => Option.getOrUndefined(Arr.head(items))),
  );
}

function historyOf(
  { db, reader }: InboxOn,
  identity: IdentityName,
  page: HistoryPageRequest,
): Fails<StoredHistoryPage> {
  return Effect.gen(function* readHistory() {
    const rows = yield* db.all(historySql(db, reader.columns), identity, page.before ?? ALL_IDS, page.limit + ONE_MORE);
    const items = yield* itemsOf(reader, rows);
    return { hasMore: items.length > page.limit, items: Arr.take(items, page.limit) };
  });
}

function changeFollow(db: SqlDatabase, reader: MessageReader, sql: string) {
  return (identity: IdentityName, id: MessageId): Fails<MessageId | undefined> =>
    db.transaction(
      Effect.flatMap(reader.findMessage(id), (message) => {
        if (Predicate.isUndefined(message)) {
          return Effect.undefined;
        }
        const thread = threadIdOf(message);
        return Effect.as(db.run(sql, identity, thread), thread);
      }),
    );
}

function changeSubscription(db: SqlDatabase, sql: string): InboxSection["subscribeChannel"] {
  return (identity, channel) =>
    db.transaction(
      Effect.flatMap(db.get("SELECT 1 AS found FROM channels WHERE name = ?", channel), (row) => {
        if (!isFoundRow(row)) {
          return Effect.succeed(false);
        }
        return Effect.as(db.run(sql, identity, channel), true);
      }),
    );
}

const SUBSCRIBED_CHANNELS = `SELECT ${CHANNEL_COLUMNS} FROM channels
  WHERE name IN (SELECT channel FROM subscriptions WHERE identity_name = ?) ORDER BY name`;

function sqlInbox({ db, reader }: InboxOn): InboxSection {
  return {
    ackInbox: (identity, upTo, at) =>
      db.transaction(
        Effect.flatMap(inboxOf({ db, reader }, identity, NOTHING_SEEN), (items) =>
          ackAllIn({ at, db, identity, messages: newestPerScope({ items, upTo }) }),
        ),
      ),
    ackMessage: (identity, id, at) =>
      db.transaction(
        Effect.flatMap(reader.findMessage(id), (message) => {
          if (Predicate.isUndefined(message)) {
            return Effect.undefined;
          }
          return ackMessageIn({ at, db, identity, message });
        }),
      ),
    findInboxItem: (identity, id) => inboxItemOf({ db, reader }, identity, id),
    followThread: changeFollow(db, reader, FOLLOW),
    listInbox: (identity) => inboxOf({ db, reader }, identity, NOTHING_SEEN),
    listInboxAfter: (identity, after) => inboxOf({ db, reader }, identity, after),
    listInboxHistory: (identity, page) => historyOf({ db, reader }, identity, page),
    listReadPositions: (identity) => readPositionsIn({ db, identity }),
    listReadReceipts: (ids) => receiptsOf({ db, ids }),
    listSubscribedChannels: (identity) =>
      db
        .all(SUBSCRIBED_CHANNELS, identity)
        .pipe(Effect.flatMap((rows) => Effect.forEach(rows, (row) => toChannel(row), { concurrency: 1 }))),
    moveReadPositionBack: (identity, id) =>
      db.transaction(
        Effect.flatMap(reader.findMessage(id), (message) => {
          if (Predicate.isUndefined(message)) {
            return Effect.undefined;
          }
          return moveReadPositionBackIn({ db, identity, message });
        }),
      ),
    subscribeChannel: changeSubscription(
      db,
      "INSERT INTO subscriptions (identity_name, channel) VALUES (?, ?) ON CONFLICT DO NOTHING",
    ),
    unfollowThread: changeFollow(db, reader, "DELETE FROM follows WHERE identity_name = ? AND thread_id = ?"),
    unsubscribeChannel: changeSubscription(db, "DELETE FROM subscriptions WHERE identity_name = ? AND channel = ?"),
  };
}

export { type MessageReader, recordAppended, sqlInbox };
