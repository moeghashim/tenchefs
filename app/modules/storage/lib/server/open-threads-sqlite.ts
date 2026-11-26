import { Array as Arr, Effect, Predicate, Schema } from "effect";
import type { DialectForms, SqlDatabase } from "./adapters/sql-database.ts";
import type { Message, OpenThread, TopLevelMessage } from "../../../messages/index.ts";
import type {
  OpenThreadsCursor,
  OpenThreadsPageRequest,
  OpenThreadsSection,
  StoredOpenThreadsPage,
} from "./open-threads.ts";
import type { IdentityName } from "../../../identities/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { MessageReader } from "./inbox-sqlite.ts";
import type { StorageUnavailable } from "./errors.ts";
import { messageColumns } from "./message-rows-sqlite.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface OpenThreadsOptions {
  readonly db: SqlDatabase;
  readonly reader: MessageReader;
}

const ONE_MORE = 1;
const ALL = 1;
const MINE = 0;
const BEFORE_EVERY_TIME = "";
const BEFORE_EVERY_ID = 0;
const ONE_AT_A_TIME = { concurrency: 1 } as const;

const ActivityRow = Schema.Struct({ last_activity_at: IsoTimeSchema });

interface OpenThreadsForms {
  readonly greatest: string;
  readonly mentionsOf: string;
}

const OPEN_THREADS_FORMS: DialectForms<OpenThreadsForms> = {
  postgres: { greatest: "greatest", mentionsOf: "jsonb_array_elements_text" },
  sqlite: { greatest: "max", mentionsOf: "json_each" },
};

function openThreadsSql(db: SqlDatabase): string {
  const { greatest, mentionsOf } = OPEN_THREADS_FORMS[db.dialect];
  return `WITH open_threads AS (
    SELECT parent.id AS thread_id, ${greatest}(
      coalesce(
        (SELECT latest.created_at FROM messages AS latest WHERE latest.reply_to = parent.id AND latest.deleted_at IS NULL
          ORDER BY latest.id DESC LIMIT 1),
        parent.created_at
      ),
      coalesce(parent.reopened_at, '')
    ) AS last_activity_at
    FROM messages AS parent
    WHERE parent.reply_to IS NULL AND parent.closed_at IS NULL AND parent.deleted_at IS NULL AND (? = ${String(ALL)} OR EXISTS (
      SELECT 1 FROM messages AS involved WHERE (involved.id = parent.id OR involved.reply_to = parent.id) AND involved.deleted_at IS NULL
        AND (involved.author_name = ? OR EXISTS (SELECT 1 FROM ${mentionsOf}(involved.mentions) WHERE value = ?))
    ))
  )
  SELECT ${messageColumns(db)}, last_activity_at FROM messages JOIN open_threads ON messages.id = open_threads.thread_id
  WHERE (last_activity_at, messages.id) > (?, ?)
  ORDER BY last_activity_at, messages.id LIMIT ?`;
}

function isTopLevel(message: Message): message is TopLevelMessage {
  return message.kind === "top-level";
}

function openThreadOf(reader: MessageReader): (row: unknown) => Fails<readonly OpenThread[]> {
  return (row) =>
    Effect.gen(function* readOpenThread() {
      const message = yield* reader.toMessage(row);
      const { last_activity_at: lastActivityAt } = yield* Schema.decodeUnknownEffect(ActivityRow)(row).pipe(
        Effect.mapError(unreadable),
      );
      return Arr.map(Arr.filter([message], isTopLevel), (parent) => ({ lastActivityAt, message: parent }));
    });
}

function scopeOf(all: boolean): number {
  if (all) {
    return ALL;
  }
  return MINE;
}

function startOf(after: OpenThreadsCursor | undefined): readonly [string, number] {
  if (Predicate.isUndefined(after)) {
    return [BEFORE_EVERY_TIME, BEFORE_EVERY_ID];
  }
  return [after.lastActivityAt, after.id];
}

interface Listing extends OpenThreadsOptions {
  readonly identity: IdentityName;
  readonly page: OpenThreadsPageRequest;
}

function openThreadsPage({ db, identity, page, reader }: Listing): Fails<StoredOpenThreadsPage> {
  const { after, all, limit } = page;
  return db.all(openThreadsSql(db), scopeOf(all), identity, identity, ...startOf(after), limit + ONE_MORE).pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, openThreadOf(reader), ONE_AT_A_TIME)),
    Effect.map(Arr.flatten),
    Effect.map((threads: readonly OpenThread[]) => ({
      hasMore: threads.length > limit,
      threads: Arr.take(threads, limit),
    })),
  );
}

function sqlOpenThreads({ db, reader }: OpenThreadsOptions): OpenThreadsSection {
  return { listOpenThreads: (identity, page) => openThreadsPage({ db, identity, page, reader }) };
}

export { sqlOpenThreads };
