import { Array as Arr, Effect, Option, Predicate, Schema } from "effect";
import type { Attachment, AttachmentId } from "../../../attachments/index.ts";
import type { DialectForms, SqlDatabase } from "./adapters/sql-database.ts";
import { isAttachmentId, opaqueContentType } from "../../../attachments/index.ts";
import type { Message } from "../../../messages/index.ts";
import type { StorageUnavailable } from "./errors.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const IMAGE = 1;
const NOT_IMAGE = 0;

interface AttachmentsSection {
  readonly findAttachment: (id: AttachmentId) => Fails<Attachment | undefined>;
}

const ATTACHMENTS_MIGRATION = `CREATE TABLE attachments (
     id TEXT PRIMARY KEY,
     message_id INTEGER NOT NULL REFERENCES messages (id),
     name TEXT NOT NULL,
     size INTEGER NOT NULL CHECK (size > 0),
     content_type TEXT NOT NULL,
     image INTEGER NOT NULL CHECK (image IN (0, 1)),
     position INTEGER NOT NULL,
     created_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX attachments_by_message ON attachments (message_id, position);`;

const POSTGRES_ATTACHMENTS_MIGRATION: readonly string[] = [
  `CREATE TABLE attachments (
     id text COLLATE "C" PRIMARY KEY,
     message_id bigint NOT NULL REFERENCES messages (id),
     name text COLLATE "C" NOT NULL,
     size integer NOT NULL CHECK (size > 0),
     content_type text COLLATE "C" NOT NULL,
     image boolean NOT NULL,
     position integer NOT NULL,
     created_at text COLLATE "C" NOT NULL
   )`,
  "CREATE INDEX attachments_by_message ON attachments (message_id, position)",
];

const SQLITE_ATTACHMENTS = `(SELECT json_group_array(json_object('id', id, 'name', name, 'size', size,
    'contentType', content_type, 'image', json(CASE WHEN image = 1 THEN 'true' ELSE 'false' END)))
  FROM (SELECT id, name, size, content_type, image FROM attachments
    WHERE attachments.message_id = messages.id ORDER BY position))`;

const POSTGRES_ATTACHMENTS = `(SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'size', a.size,
    'contentType', a.content_type, 'image', a.image) ORDER BY a.position), '[]')
  FROM attachments AS a WHERE a.message_id = messages.id)`;

const ATTACHMENTS_COLUMN: DialectForms<string> = { postgres: POSTGRES_ATTACHMENTS, sqlite: SQLITE_ATTACHMENTS };

const ContentTypeSchema = Schema.Literals(["image/png", "image/jpeg", "image/gif", "image/webp", opaqueContentType]);

const AttachmentCell = Schema.Struct({
  contentType: ContentTypeSchema,
  id: Schema.String.pipe(Schema.refine(isAttachmentId)),
  image: Schema.Boolean,
  name: Schema.String,
  size: Schema.Int,
});

const AttachmentsColumn = Schema.fromJsonString(Schema.Array(AttachmentCell));

const AttachmentRow = Schema.Struct({
  content_type: ContentTypeSchema,
  id: Schema.String.pipe(Schema.refine(isAttachmentId)),
  image: Schema.Literals([NOT_IMAGE, IMAGE]),
  name: Schema.String,
  size: Schema.Int,
});

const ONE_AT_A_TIME = { concurrency: 1, discard: true } as const;

function attachmentsColumn(db: SqlDatabase): string {
  return ATTACHMENTS_COLUMN[db.dialect];
}

function attachmentsField(attachments: readonly Attachment[]): { readonly attachments?: readonly Attachment[] } {
  if (Arr.isReadonlyArrayNonEmpty(attachments)) {
    return { attachments };
  }
  return {};
}

function insertAttachments(db: SqlDatabase): (message: Message) => Fails<void> {
  return (message) =>
    Effect.forEach(
      message.attachments ?? [],
      (attachment, position) =>
        db.run(
          `INSERT INTO attachments (id, message_id, name, size, content_type, image, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          attachment.id,
          message.id,
          attachment.name,
          attachment.size,
          attachment.contentType,
          Number(attachment.image),
          position,
          message.createdAt,
        ),
      ONE_AT_A_TIME,
    );
}

function rowToAttachment(row: unknown): Fails<Attachment> {
  return Schema.decodeUnknownEffect(AttachmentRow)(row).pipe(
    Effect.mapBoth({
      onFailure: unreadable,
      onSuccess: ({ content_type: contentType, id, image, name, size }) => ({
        contentType,
        id,
        image: image === IMAGE,
        name,
        size,
      }),
    }),
  );
}

function sqlAttachments(db: SqlDatabase): AttachmentsSection {
  return {
    findAttachment: (id) =>
      db.get("SELECT id, name, size, content_type, image FROM attachments WHERE id = ?", id).pipe(
        Effect.flatMap((row) => {
          if (Predicate.isObject(row)) {
            return rowToAttachment(row);
          }
          return Effect.undefined;
        }),
      ),
  };
}

function attachmentIn(id: AttachmentId): (messages: readonly Message[]) => Attachment | undefined {
  return (messages) => {
    const all = Arr.flatMap(messages, (message) => message.attachments ?? []);
    return Option.getOrUndefined(Arr.findFirst(all, (found) => found.id === id));
  };
}

export {
  ATTACHMENTS_MIGRATION,
  type AttachmentsSection,
  AttachmentsColumn,
  POSTGRES_ATTACHMENTS_MIGRATION,
  attachmentIn,
  attachmentsColumn,
  attachmentsField,
  insertAttachments,
  sqlAttachments,
};
