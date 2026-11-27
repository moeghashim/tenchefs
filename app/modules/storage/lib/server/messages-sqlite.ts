import type {
  AppendMessageResult,
  ChannelPageRequest,
  Deleting,
  MessagesSection,
  NewMessage,
  Placement,
} from "./messages.ts";
import { Array as Arr, Effect, Option, Predicate, Schema, pipe } from "effect";
import type {
  ListMessagesResponse,
  Message,
  MessageId,
  ReadReceipt,
  ThreadResponse,
  TopLevelMessage,
} from "../../../messages/index.ts";
import { MentionsText, dataText, messageColumns, replyTargets, toMessage } from "./message-rows-sqlite.ts";
import { insertAttachments, sqlAttachments } from "./attachments.ts";
import { isPlaced, placeIn, placed, threadIdOf, withKnownMentions } from "./messages.ts";
import { latestOf, stampedIn, takeId } from "./message-sequence-sqlite.ts";
import { recordAppended, sqlInbox } from "./inbox-sqlite.ts";
import { sqlClosedThreads, threadChangedBy } from "./closed-threads-sqlite.ts";
import type { MessageReader } from "./inbox-sqlite.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
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
  (id, channel, author_name, author_owner, text, data, reply_to, mentions, created_at, harness, scheduled_message_id,
  title, title_set_by, title_set_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

type TitleColumns = readonly [string | null, string | null, string | null];

const UNTITLED: TitleColumns = [null, null, null];

function replyToOf(message: Message): MessageId | null {
  if (message.kind === "reply") {
    return message.replyTo;
  }
  return null;
}

function find(db: SqlDatabase, id: MessageId): Fails<Message | undefined> {
  return db.get(`SELECT ${messageColumns(db)} FROM messages WHERE id = ? AND deleted_at IS NULL`, id).pipe(
    Effect.flatMap((row) => {
      if (Predicate.isObject(row)) {
        return toMessage(row);
      }
      return Effect.undefined;
    }),
  );
}

function channelExists(db: SqlDatabase, channel: ChannelName): Fails<boolean> {
  return db.get("SELECT 1 AS found FROM channels WHERE name = ?", channel).pipe(Effect.map(isFoundRow));
}

function placementOf(db: SqlDatabase, { channel, replyTo }: NewMessage): Fails<Placement> {
  if (Predicate.isUndefined(replyTo)) {
    return Effect.succeed({ status: "top-level" });
  }
  return Effect.map(replyTargets(db)(replyTo), (found) => placeIn({ channel, found }));
}

function titleColumnsOf(message: Message): TitleColumns {
  if (message.kind === "reply") {
    return UNTITLED;
  }
  const { title = null, titleSetAt = null, titleSetBy = null } = message;
  return [title, titleSetBy, titleSetAt];
}

function scheduleOf({ scheduledMessage }: Message): number | null {
  if (Predicate.isUndefined(scheduledMessage)) {
    return null;
  }
  return scheduledMessage.id;
}

function insert(db: SqlDatabase, message: Message, data: string | null): Fails<void> {
  return Effect.gen(function* insertMessage() {
    const mentions = yield* Schema.encodeEffect(MentionsText)(message.mentions).pipe(Effect.mapError(unreadable));
    const owner = message.author.owner ?? null;
    const replyTo = replyToOf(message);
    const { harness = null, author, channel, createdAt, id, text } = message;
    const schedule = scheduleOf(message);
    const columns = [
      id,
      channel,
      author.name,
      owner,
      text,
      data,
      replyTo,
      mentions,
      createdAt,
      harness,
      schedule,
      ...titleColumnsOf(message),
    ] as const;
    yield* db.run(INSERT_MESSAGE, ...columns);
  });
}

function knownNames(db: SqlDatabase, names: Message["mentions"]): Fails<ReadonlySet<Message["mentions"][number]>> {
  return pipe(
    names,
    Effect.filter((name) =>
      db.get("SELECT 1 AS found FROM identities WHERE name = ? AND NOT deactivated", name).pipe(Effect.map(isFoundRow)),
    ),
    Effect.map((found: Message["mentions"]) => new Set(found)),
  );
}

function sqlMessageReader(db: SqlDatabase): MessageReader {
  return { columns: messageColumns(db), findMessage: (id) => find(db, id), toMessage };
}

function afterInsert(
  db: SqlDatabase,
  message: Message,
  close: NewMessage["close"],
): Fails<readonly [readonly ReadReceipt[], TopLevelMessage | undefined]> {
  const reader = sqlMessageReader(db);
  return Effect.all([recordAppended({ db, message }), threadChangedBy({ close, db, message, reader })], ONE_AT_A_TIME);
}

function appendInChannel(db: SqlDatabase, message: NewMessage): Fails<AppendMessageResult> {
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
    const [receipts, threadChanged] = yield* insert(db, stored, data).pipe(
      Effect.andThen(insertAttachments(db)(stored)),
      Effect.andThen(afterInsert(db, stored, message.close)),
    );
    return { message: stored, receipts, status: "appended", threadChanged } as const;
  });
}

function append(db: SqlDatabase, message: NewMessage): Fails<AppendMessageResult> {
  return Effect.gen(function* appendIfChannel() {
    const exists = yield* channelExists(db, message.channel);
    if (exists) {
      return yield* appendInChannel(db, message);
    }
    return { status: "channel_not_found" } as const;
  });
}

function threadMessages(db: SqlDatabase, parentId: MessageId): Fails<readonly Message[]> {
  const sql = `SELECT ${messageColumns(db)} FROM messages
    WHERE (id = ? OR reply_to = ?) AND deleted_at IS NULL ORDER BY id`;
  return db.all(sql, parentId, parentId).pipe(Effect.flatMap((rows) => Effect.forEach(rows, toMessage, ONE_AT_A_TIME)));
}

function threadOf(db: SqlDatabase, id: MessageId): Fails<Omit<ThreadResponse, "receipts"> | undefined> {
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

function newestRows(db: SqlDatabase, channel: ChannelName, page: ChannelPageRequest): Fails<readonly unknown[]> {
  const sql = `SELECT ${messageColumns(db)} FROM messages
    WHERE channel = ? AND reply_to IS NULL AND deleted_at IS NULL AND id < ? ORDER BY id DESC LIMIT ?`;
  return db.all(sql, channel, page.before ?? ALL_IDS, page.limit + ONE_MORE);
}

function pageOf(db: SqlDatabase, channel: ChannelName, page: ChannelPageRequest): Fails<Page> {
  return Effect.gen(function* readPage() {
    const rows = yield* newestRows(db, channel, page);
    const messages = yield* Effect.forEach(rows, toMessage, ONE_AT_A_TIME);
    const newest = Arr.filter(messages, (message) => message.kind === "top-level");
    const shown = Arr.reverse(Arr.take(newest, page.limit));
    return { hasMore: newest.length > page.limit, messages: shown };
  });
}

const DELETE_THREAD = `UPDATE messages SET deleted_at = ?, deleted_by = ?
  WHERE (id = ? OR reply_to = ?) AND deleted_at IS NULL`;

function deleteIn(db: SqlDatabase, id: MessageId, deleting: Deleting): Fails<Message | undefined> {
  return Effect.gen(function* deleteMessage() {
    const found = yield* find(db, id);
    if (Predicate.isUndefined(found)) {
      return found;
    }
    yield* db.run(DELETE_THREAD, deleting.deletedAt, deleting.deletedBy, id, id);
    return found;
  });
}

type SharedMessagesSection = Omit<MessagesSection, "searchMessages"> & ReturnType<typeof sqlInbox>;

function sqlMessages(db: SqlDatabase): SharedMessagesSection {
  return {
    ...sqlInbox({ db, reader: sqlMessageReader(db) }),
    ...sqlClosedThreads({ db, reader: sqlMessageReader(db) }),
    ...sqlAttachments(db),
    appendMessage: (message) => db.transaction(append(db, message)),
    deleteMessage: (id, deleting) => db.transaction(deleteIn(db, id, deleting)),
    findReplyTarget: replyTargets(db),
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

function appenderOf(db: SqlDatabase): (message: NewMessage) => Fails<AppendMessageResult> {
  return (message) => append(db, message);
}

export { appenderOf, sqlMessageReader, sqlMessages };
