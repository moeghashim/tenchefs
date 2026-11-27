import { Array as Arr, Effect, Order, Predicate, Schema } from "effect";
import { AttachmentsColumn, attachmentsColumn, attachmentsField } from "./attachments.ts";
import type { Author, Closing, Message, MessageId } from "../../../messages/index.ts";
import type { DialectForms, SqlDatabase } from "./adapters/sql-database.ts";
import type { Harness, IdentityName, Owner } from "../../../identities/index.ts";
import type { NewMessage, ReplyTarget, Titling } from "./messages.ts";
import { isHarness, isIdentityName, isOwner } from "../../../identities/index.ts";
import { isMessageId, shownRepliers } from "../../../messages/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { ScheduledMessageMarker } from "../../../scheduled-messages/index.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isChannelName } from "../../../channels/index.ts";
import { isScheduledMessageId } from "../../../scheduled-messages/index.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const MessageIdColumn = Schema.Int.pipe(Schema.refine(isMessageId));
const ScheduledMessageIdColumn = Schema.Int.pipe(Schema.refine(isScheduledMessageId));
const IdentityNameColumn = Schema.String.pipe(Schema.refine(isIdentityName));
const MentionsColumn = Schema.fromJsonString(Schema.Array(IdentityNameColumn));
const OwnerColumn = Schema.String.pipe(Schema.refine(isOwner));
const HarnessColumn = Schema.String.pipe(Schema.refine(isHarness));
const MentionsText = Schema.fromJsonString(Schema.Array(Schema.String));
const JsonText = Schema.fromJsonString(Schema.Json);
const ReplierCell = Schema.Struct({ last: Schema.Int, name: IdentityNameColumn, owner: Schema.NullOr(OwnerColumn) });
const RepliersColumn = Schema.fromJsonString(Schema.Array(ReplierCell));
const latestFirst = Order.flip(Order.mapInput(Order.Number, (cell: typeof ReplierCell.Type) => cell.last));

const MessageRow = Schema.Struct({
  attachments: AttachmentsColumn,
  author_name: IdentityNameColumn,
  author_owner: Schema.NullOr(OwnerColumn),
  channel: Schema.String.pipe(Schema.refine(isChannelName)),
  closed_at: Schema.NullOr(IsoTimeSchema),
  closed_by: Schema.NullOr(IdentityNameColumn),
  created_at: IsoTimeSchema,
  data: Schema.NullOr(Schema.String),
  harness: Schema.NullOr(HarnessColumn),
  id: MessageIdColumn,
  latest_reply_at: Schema.NullOr(IsoTimeSchema),
  latest_reply_id: Schema.NullOr(MessageIdColumn),
  mentions: MentionsColumn,
  repliers: RepliersColumn,
  reply_count: Schema.Int,
  reply_to: Schema.NullOr(MessageIdColumn),
  scheduled_message_deleted_at: Schema.NullOr(Schema.String),
  scheduled_message_id: Schema.NullOr(ScheduledMessageIdColumn),
  text: Schema.String,
  title: Schema.NullOr(Schema.String),
  title_set_at: Schema.NullOr(IsoTimeSchema),
  title_set_by: Schema.NullOr(IdentityNameColumn),
});

type MessageRowType = typeof MessageRow.Type;

interface DataField {
  readonly data?: Schema.Json;
}

const NO_DATA: DataField = {};
const NO_HARNESS = {};
const NO_SCHEDULE = {};

const SHOWN_REPLIERS = String(shownRepliers);

const SQLITE_REPLIERS = `(SELECT json_group_array(json_object('name', name, 'owner', owner, 'last', last)) FROM (
    SELECT replies.author_name AS name, replies.author_owner AS owner, max(replies.id) AS last
    FROM messages AS replies WHERE replies.reply_to = messages.id AND replies.deleted_at IS NULL
    GROUP BY replies.author_name ORDER BY last DESC LIMIT ${SHOWN_REPLIERS}
  ))`;

const POSTGRES_REPLIERS = `(SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'owner', owner, 'last', last)), '[]')
  FROM (SELECT name, owner, last FROM (
    SELECT DISTINCT ON (replies.author_name) replies.author_name AS name, replies.author_owner AS owner,
      replies.id AS last
    FROM messages AS replies WHERE replies.reply_to = messages.id AND replies.deleted_at IS NULL
    ORDER BY replies.author_name, replies.id DESC
  ) AS latest_per_replier ORDER BY last DESC LIMIT ${SHOWN_REPLIERS}) AS shown_repliers)`;

const REPLIERS: DialectForms<string> = { postgres: POSTGRES_REPLIERS, sqlite: SQLITE_REPLIERS };

function messageColumns(db: SqlDatabase): string {
  const repliers = REPLIERS[db.dialect];
  return `id, channel, author_name, author_owner, text, data, reply_to, mentions, created_at, harness,
  closed_at, closed_by, title, title_set_by, title_set_at, scheduled_message_id,
  (SELECT schedules.deleted_at FROM scheduled_messages AS schedules
    WHERE schedules.id = messages.scheduled_message_id) AS scheduled_message_deleted_at,
  (SELECT count(*) FROM messages AS replies WHERE replies.reply_to = messages.id AND replies.deleted_at IS NULL) AS reply_count,
  (SELECT max(replies.id) FROM messages AS replies WHERE replies.reply_to = messages.id AND replies.deleted_at IS NULL) AS latest_reply_id,
  (SELECT replies.created_at FROM messages AS replies WHERE replies.reply_to = messages.id AND replies.deleted_at IS NULL
    ORDER BY replies.id DESC LIMIT 1) AS latest_reply_at,
  ${repliers} AS repliers,
  ${attachmentsColumn(db)} AS attachments`;
}

interface StoredAuthor {
  readonly name: IdentityName;
  readonly owner: Owner | null;
}

function authorOf({ name, owner }: StoredAuthor): Author {
  if (Predicate.isNull(owner)) {
    return { name };
  }
  return { name, owner };
}

function repliersOf(row: MessageRowType): readonly Author[] {
  return Arr.map(Arr.sort(row.repliers, latestFirst), authorOf);
}

function harnessOf(row: MessageRowType): { readonly harness?: Harness } {
  if (Predicate.isNull(row.harness)) {
    return NO_HARNESS;
  }
  return { harness: row.harness };
}

function closingOf(row: MessageRowType): Partial<Closing> {
  if (Predicate.isNull(row.closed_at) || Predicate.isNull(row.closed_by)) {
    return {};
  }
  return { closedAt: row.closed_at, closedBy: row.closed_by };
}

function titlingOf(row: MessageRowType): Partial<Titling> {
  if (Predicate.isNull(row.title) || Predicate.isNull(row.title_set_by) || Predicate.isNull(row.title_set_at)) {
    return {};
  }
  return { title: row.title, titleSetAt: row.title_set_at, titleSetBy: row.title_set_by };
}

function scheduledOf(row: MessageRowType): { readonly scheduledMessage?: ScheduledMessageMarker } {
  if (Predicate.isNull(row.scheduled_message_id)) {
    return NO_SCHEDULE;
  }
  return { scheduledMessage: { deleted: row.scheduled_message_deleted_at !== null, id: row.scheduled_message_id } };
}

function messageOf(row: MessageRowType, data: DataField): Message {
  const fields = {
    author: authorOf({ name: row.author_name, owner: row.author_owner }),
    channel: row.channel,
    createdAt: row.created_at,
    id: row.id,
  };
  const content = {
    ...fields,
    ...harnessOf(row),
    ...scheduledOf(row),
    ...data,
    ...attachmentsField(row.attachments),
    mentions: row.mentions,
    text: row.text,
  };
  if (Predicate.isNull(row.reply_to)) {
    const replies = {
      latestReplyAt: row.latest_reply_at,
      latestReplyId: row.latest_reply_id,
      replyCount: row.reply_count,
    };
    return {
      ...content,
      ...replies,
      ...closingOf(row),
      ...titlingOf(row),
      kind: "top-level",
      repliers: repliersOf(row),
    };
  }
  return { ...content, kind: "reply", replyTo: row.reply_to };
}

function dataOf(text: string | null): Fails<DataField> {
  if (Predicate.isNull(text)) {
    return Effect.succeed(NO_DATA);
  }
  return Schema.decodeEffect(JsonText)(text).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: (data): DataField => ({ data }) }),
  );
}

function toMessage(row: unknown): Fails<Message> {
  return Effect.gen(function* readMessage() {
    const decoded = yield* Schema.decodeUnknownEffect(MessageRow)(row).pipe(Effect.mapError(unreadable));
    const data = yield* dataOf(decoded.data);
    return messageOf(decoded, data);
  });
}

function dataText(message: NewMessage): Fails<string | null> {
  if (Predicate.isUndefined(message.data)) {
    return Effect.succeed(null);
  }
  return Schema.encodeEffect(JsonText)(message.data).pipe(Effect.mapError(unreadable));
}

const ReplyTargetRow = Schema.Struct({
  channel: Schema.String.pipe(Schema.refine(isChannelName)),
  thread: MessageIdColumn,
  thread_deleted_at: Schema.NullOr(Schema.String),
});

const FIND_REPLY_TARGET = `SELECT asked.channel AS channel, thread.id AS thread, thread.deleted_at AS thread_deleted_at
  FROM messages AS asked JOIN messages AS thread ON thread.id = COALESCE(asked.reply_to, asked.id)
  WHERE asked.id = ?`;

function replyTargets(db: SqlDatabase): (id: MessageId) => Fails<ReplyTarget | undefined> {
  return (id) =>
    db.get(FIND_REPLY_TARGET, id).pipe(
      Effect.flatMap((row) => {
        if (Predicate.isUndefined(row)) {
          return Effect.undefined;
        }
        return Schema.decodeUnknownEffect(ReplyTargetRow)(row).pipe(
          Effect.mapBoth({
            onFailure: unreadable,
            onSuccess: ({ channel, thread, thread_deleted_at: deletedAt }) => ({
              channel,
              thread,
              threadDeleted: deletedAt !== null,
            }),
          }),
        );
      }),
    );
}

export { messageColumns, MentionsText, MessageIdColumn, dataText, replyTargets, toMessage };
