import type { AppendMessageResult, ChannelPageRequest, MessagesSection, NewMessage, Placement } from "./messages.ts";
import { Array as Arr, Effect, Option, Predicate, Schema, pipe } from "effect";
import type {
  ListMessagesResponse,
  Message,
  MessageId,
  ReadReceipt,
  ThreadResponse,
  TopLevelMessage,
} from "../../../messages/index.ts";
import { MESSAGE_COLUMNS, MentionsText, dataText, toMessage } from "./message-rows-sqlite.ts";
import { isPlaced, placeIn, placed, threadIdOf, withKnownMentions } from "./messages.ts";
import { latestOf, stampedIn, takeId } from "./message-sequence-sqlite.ts";
import { recordAppended, sqliteInbox } from "./inbox-sqlite.ts";
import { sqliteClosedThreads, threadChangedBy } from "./closed-threads-sqlite.ts";
import type { CommandCallsSection } from "./command-calls.ts";
import type { MessageReader } from "./inbox-sqlite.ts";
import type { SqliteDatabase } from "./adapters/sqlite.ts";
import type { StorageUnavailable } from "./errors.ts";
import { sqliteCommandCalls } from "./command-calls.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;
type ChannelName = NewMessage["channel"];
type Page = Omit<ListMessagesResponse, "receipts">;

const FOUND = 1;
const ONE_MORE = 1;
const ALL_IDS = Number.MAX_SAFE_INTEGER;
const ONE_AT_A_TIME = { concurrency: 1 } as const;

const isFoundRow = Schema.is(Schema.Struct({ found: Schema.Literal(FOUND) }));

const INSERT_MESSAGE = `INSERT INTO messages
  (id, channel, author_name, author_owner, text, data, reply_to, mentions, created_at, harness)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function replyToOf(message: Message): MessageId | null {
  if (message.kind === "reply") {
    return message.replyTo;
  }
  return null;
}

function find(db: SqliteDatabase, id: MessageId): Fails<Message | undefined> {
  return db.get(`SELECT ${MESSAGE_COLUMNS} FROM messages WHERE id = ?`, id).pipe(
    Effect.flatMap((row) => {
      if (Predicate.isObject(row)) {
        return toMessage(row);
      }
      return Effect.undefined;
    }),
  );
}

function channelExists(db: SqliteDatabase, channel: ChannelName): Fails<boolean> {
  return db.get("SELECT 1 AS found FROM channels WHERE name = ?", channel).pipe(Effect.map(isFoundRow));
}

function placementOf(db: SqliteDatabase, { channel, replyTo }: NewMessage): Fails<Placement> {
  if (Predicate.isUndefined(replyTo)) {
    return Effect.succeed({ status: "top-level" });
  }
  return Effect.map(find(db, replyTo), (found) => placeIn({ channel, found }));
}

function insert(db: SqliteDatabase, message: Message, data: string | null): Fails<void> {
  return Effect.gen(function* insertMessage() {
    const mentions = yield* Schema.encodeEffect(MentionsText)(message.mentions).pipe(Effect.mapError(unreadable));
    const owner = message.author.owner ?? null;
    const replyTo = replyToOf(message);
    const { harness = null, author, channel, createdAt, id, text } = message;
    const columns = [id, channel, author.name, owner, text, data, replyTo, mentions, createdAt, harness] as const;
    yield* db.run(INSERT_MESSAGE, ...columns);
  });
}

function knownNames(db: SqliteDatabase, names: Message["mentions"]): Fails<ReadonlySet<Message["mentions"][number]>> {
  return pipe(
    names,
    Effect.filter((name) =>
      db.get("SELECT 1 AS found FROM identities WHERE name = ? AND deactivated = 0", name).pipe(Effect.map(isFoundRow)),
    ),
    Effect.map((found: Message["mentions"]) => new Set(found)),
  );
}

function sqliteMessageReader(db: SqliteDatabase): MessageReader {
  return { columns: MESSAGE_COLUMNS, findMessage: (id) => find(db, id), toMessage };
}

function afterInsert(
  db: SqliteDatabase,
  message: Message,
  close: NewMessage["close"],
): Fails<readonly [readonly ReadReceipt[], TopLevelMessage | undefined]> {
  const reader = sqliteMessageReader(db);
  return Effect.all([recordAppended({ db, message }), threadChangedBy({ close, db, message, reader })], ONE_AT_A_TIME);
}

function appendInChannel(db: SqliteDatabase, message: NewMessage): Fails<AppendMessageResult> {
  return Effect.gen(function* appendMessage() {
    const placement = yield* placementOf(db, message);
    if (!isPlaced(placement)) {
      return placement;
    }
    const data = yield* dataText(message);
    const known = yield* knownNames(db, message.mentions);
    const mentioning = yield* stampedIn({ db, message: withKnownMentions({ known, message }) });
    const id = yield* takeId({ db, message: mentioning });
    const stored = placed({ id, message: mentioning, placement });
    const [receipts, threadChanged] = yield* Effect.andThen(
      insert(db, stored, data),
      afterInsert(db, stored, message.close),
    );
    return { message: stored, receipts, status: "appended", threadChanged } as const;
  });
}

function append(db: SqliteDatabase, message: NewMessage): Fails<AppendMessageResult> {
  return Effect.gen(function* appendIfChannel() {
    const exists = yield* channelExists(db, message.channel);
    if (exists) {
      return yield* appendInChannel(db, message);
    }
    return { status: "channel_not_found" } as const;
  });
}

function threadMessages(db: SqliteDatabase, parentId: MessageId): Fails<readonly Message[]> {
  const sql = `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE id = ? OR reply_to = ? ORDER BY id`;
  return db.all(sql, parentId, parentId).pipe(Effect.flatMap((rows) => Effect.forEach(rows, toMessage, ONE_AT_A_TIME)));
}

function threadOf(db: SqliteDatabase, id: MessageId): Fails<Omit<ThreadResponse, "receipts"> | undefined> {
  return Effect.gen(function* getThread() {
    const found = yield* find(db, id);
    if (Predicate.isUndefined(found)) {
      return found;
    }
    const messages = yield* threadMessages(db, threadIdOf(found));
    return pipe(
      Arr.findFirst(messages, (message) => message.kind === "top-level"),
      Option.map((parent) => ({ parent, replies: Arr.filter(messages, (reply) => reply.kind === "reply") })),
      Option.getOrUndefined,
    );
  });
}

function newestRows(db: SqliteDatabase, channel: ChannelName, page: ChannelPageRequest): Fails<readonly unknown[]> {
  const sql = `SELECT ${MESSAGE_COLUMNS} FROM messages
    WHERE channel = ? AND reply_to IS NULL AND id < ? ORDER BY id DESC LIMIT ?`;
  return db.all(sql, channel, page.before ?? ALL_IDS, page.limit + ONE_MORE);
}

function pageOf(db: SqliteDatabase, channel: ChannelName, page: ChannelPageRequest): Fails<Page> {
  return Effect.gen(function* readPage() {
    const rows = yield* newestRows(db, channel, page);
    const messages = yield* Effect.forEach(rows, toMessage, ONE_AT_A_TIME);
    const newest = Arr.filter(messages, (message) => message.kind === "top-level");
    const shown = Arr.reverse(Arr.take(newest, page.limit));
    return { hasMore: newest.length > page.limit, messages: shown };
  });
}

function sqliteMessages(db: SqliteDatabase): MessagesSection & ReturnType<typeof sqliteInbox> & CommandCallsSection {
  return {
    ...sqliteInbox({ db, reader: sqliteMessageReader(db) }),
    ...sqliteClosedThreads({ db, reader: sqliteMessageReader(db) }),
    ...sqliteCommandCalls({ appendMessage: (message) => append(db, message), db }),
    appendMessage: (message) => db.transaction(append(db, message)),
    getThread: (id) => threadOf(db, id),
    latestMessageId: latestOf(db),
    listChannelMessages: (channel, page) =>
      Effect.flatMap(channelExists(db, channel), (exists) => {
        if (exists) {
          return pageOf(db, channel, page);
        }
        return Effect.undefined;
      }),
  };
}

export { sqliteMessages };
