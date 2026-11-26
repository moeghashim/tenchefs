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

const ATTACHMENT_SIZES_MIGRATION = `ALTER TABLE attachments ADD COLUMN width INTEGER CHECK (width > 0);
   ALTER TABLE attachments ADD COLUMN height INTEGER CHECK (height > 0);`;

const POSTGRES_ATTACHMENT_SIZES_MIGRATION: readonly string[] = [
  "ALTER TABLE attachments ADD COLUMN width integer CHECK (width > 0)",
  "ALTER TABLE attachments ADD COLUMN height integer CHECK (height > 0)",
];

const SQLITE_ATTACHMENTS = `(SELECT json_group_array(json_patch(json_object('id', id, 'name', name, 'size', size,
    'contentType', content_type, 'image', json(CASE WHEN image = 1 THEN 'true' ELSE 'false' END)),
    json_object('width', width, 'height', height)))
  FROM (SELECT id, name, size, content_type, image, width, height FROM attachments
    WHERE attachments.message_id = messages.id ORDER BY position))`;

const POSTGRES_ATTACHMENTS = `(SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', a.id, 'name', a.name,
    'size', a.size, 'contentType', a.content_type, 'image', a.image, 'width', a.width, 'height', a.height))
    ORDER BY a.position), '[]')
  FROM attachments AS a WHERE a.message_id = messages.id)`;

const ATTACHMENTS_COLUMN: DialectForms<string> = { postgres: POSTGRES_ATTACHMENTS, sqlite: SQLITE_ATTACHMENTS };

const ContentTypeSchema = Schema.Literals(["image/png", "image/jpeg", "image/gif", "image/webp", opaqueContentType]);

const AttachmentCell = Schema.Struct({
  contentType: ContentTypeSchema,
  height: Schema.optionalKey(Schema.Int),
  id: Schema.String.pipe(Schema.refine(isAttachmentId)),
  image: Schema.Boolean,
  name: Schema.String,
  size: Schema.Int,
  width: Schema.optionalKey(Schema.Int),
});

const AttachmentsColumn = Schema.fromJsonString(Schema.Array(AttachmentCell));

const AttachmentRow = Schema.Struct({
  content_type: ContentTypeSchema,
  height: Schema.NullOr(Schema.Int),
  id: Schema.String.pipe(Schema.refine(isAttachmentId)),
  image: Schema.Literals([NOT_IMAGE, IMAGE]),
  name: Schema.String,
  size: Schema.Int,
  width: Schema.NullOr(Schema.Int),
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
          `INSERT INTO attachments (id, message_id, name, size, content_type, image, width, height, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          attachment.id,
          message.id,
          attachment.name,
          attachment.size,
          attachment.contentType,
          Number(attachment.image),
          attachment.width ?? null,
          attachment.height ?? null,
          position,
          message.createdAt,
        ),
      ONE_AT_A_TIME,
    );
}

function sizeFields(width: number | null, height: number | null): Pick<Attachment, "width" | "height"> {
  if (width === null || height === null) {
    return {};
  }
  return { height, width };
}

function rowToAttachment(row: unknown): Fails<Attachment> {
  return Schema.decodeUnknownEffect(AttachmentRow)(row).pipe(
    Effect.mapBoth({
      onFailure: unreadable,
      onSuccess: ({ content_type: contentType, height, id, image, name, size, width }) => ({
        contentType,
        id,
        image: image === IMAGE,
        name,
        size,
        ...sizeFields(width, height),
      }),
    }),
  );
}

const FIND_ATTACHMENT = `SELECT a.id, a.name, a.size, a.content_type, a.image, a.width, a.height
  FROM attachments AS a JOIN messages AS m ON m.id = a.message_id WHERE a.id = ? AND m.deleted_at IS NULL`;

function sqlAttachments(db: SqlDatabase): AttachmentsSection {
  return {
    findAttachment: (id) =>
      db.get(FIND_ATTACHMENT, id).pipe(
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
  ATTACHMENT_SIZES_MIGRATION,
  ATTACHMENTS_MIGRATION,
  type AttachmentsSection,
  AttachmentsColumn,
  POSTGRES_ATTACHMENT_SIZES_MIGRATION,
  POSTGRES_ATTACHMENTS_MIGRATION,
  attachmentIn,
  attachmentsColumn,
  attachmentsField,
  insertAttachments,
  sqlAttachments,
};
