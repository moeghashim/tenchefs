import { Array as Arr, Effect, Predicate, Schema } from "effect";
import type { MessageId, Reaction } from "../../../messages/index.ts";
import type { NewReaction, ReactionKey, ReactionsSection } from "./reactions.ts";
import { isMessageId, isReactionName } from "../../../messages/index.ts";
import type { IdentityName } from "../../../identities/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isFalse } from "./adapters/sql-database.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { sortedReactions } from "./reactions.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const NONE = 0;
const SEEN = 1;
const UNSEEN = 0;

const REACTIONS_MIGRATION = `CREATE TABLE reactions (
     message_id INTEGER NOT NULL REFERENCES messages (id),
     identity_name TEXT NOT NULL,
     reaction TEXT NOT NULL,
     reacted_at TEXT NOT NULL,
     seen INTEGER NOT NULL CHECK (seen IN (0, 1)),
     PRIMARY KEY (message_id, identity_name, reaction)
   ) STRICT, WITHOUT ROWID;
   CREATE INDEX unseen_reactions ON reactions (message_id) WHERE seen = 0;`;

const COLUMNS = "r.message_id, r.identity_name, r.reaction, r.reacted_at";

const ReactionRow = Schema.Struct({
  identity_name: Schema.String.pipe(Schema.refine(isIdentityName)),
  message_id: Schema.Int.pipe(Schema.refine(isMessageId)),
  reacted_at: IsoTimeSchema,
  reaction: Schema.String.pipe(Schema.refine(isReactionName)),
});

function reactionRow(row: unknown): Fails<Reaction> {
  return Schema.decodeUnknownEffect(ReactionRow)(row).pipe(
    Effect.mapBoth({
      onFailure: unreadable,
      onSuccess: (decoded): Reaction => ({
        identity: decoded.identity_name,
        messageId: decoded.message_id,
        reactedAt: decoded.reacted_at,
        reaction: decoded.reaction,
      }),
    }),
  );
}

function reactionRows(rows: readonly unknown[]): Fails<readonly Reaction[]> {
  return Effect.map(Effect.forEach(rows, reactionRow, ONE_AT_A_TIME), sortedReactions);
}

function placesFor(ids: readonly MessageId[]): string {
  return Arr.join(
    Arr.map(ids, () => "?"),
    ", ",
  );
}

function messageExists(db: SqlDatabase, id: MessageId): Fails<boolean> {
  return Effect.map(db.get("SELECT 1 AS found FROM messages WHERE id = ?", id), Predicate.isObject);
}

function ifMessage(
  db: SqlDatabase,
  id: MessageId,
  change: () => Fails<readonly unknown[]>,
): Fails<boolean | undefined> {
  return db.transaction(
    Effect.flatMap(messageExists(db, id), (exists) => {
      if (!exists) {
        return Effect.undefined;
      }
      return Effect.map(change(), (rows) => rows.length > NONE);
    }),
  );
}

function seenFlag(notifiesAuthor: boolean): number {
  if (notifiesAuthor) {
    return UNSEEN;
  }
  return SEEN;
}

function add(db: SqlDatabase, adding: NewReaction): Fails<boolean | undefined> {
  const { identity, messageId, notifiesAuthor, reactedAt, reaction } = adding;
  const seen = seenFlag(notifiesAuthor);
  return ifMessage(db, messageId, () =>
    db.all(
      `INSERT INTO reactions (message_id, identity_name, reaction, reacted_at, seen)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING message_id`,
      messageId,
      identity,
      reaction,
      reactedAt,
      seen,
    ),
  );
}

function remove(db: SqlDatabase, { identity, messageId, reaction }: ReactionKey): Fails<boolean | undefined> {
  return ifMessage(db, messageId, () =>
    db.all(
      "DELETE FROM reactions WHERE message_id = ? AND identity_name = ? AND reaction = ? RETURNING message_id",
      messageId,
      identity,
      reaction,
    ),
  );
}

function list(db: SqlDatabase, ids: readonly MessageId[]): Fails<readonly Reaction[]> {
  if (Arr.isReadonlyArrayEmpty(ids)) {
    return Effect.succeed([]);
  }
  return Effect.flatMap(
    db.all(`SELECT ${COLUMNS} FROM reactions AS r WHERE r.message_id IN (${placesFor(ids)})`, ...ids),
    reactionRows,
  );
}

function unseen(db: SqlDatabase, author: IdentityName): Fails<readonly Reaction[]> {
  return Effect.flatMap(
    db.all(
      `SELECT ${COLUMNS} FROM reactions AS r JOIN messages AS m ON m.id = r.message_id
       WHERE ${isFalse[db.dialect]("r.seen")} AND m.author_name = ?`,
      author,
    ),
    reactionRows,
  );
}

function markSeen(db: SqlDatabase, author: IdentityName, ids: readonly MessageId[]): Fails<void> {
  if (Arr.isReadonlyArrayEmpty(ids)) {
    return Effect.void;
  }
  return db.run(
    `UPDATE reactions SET seen = TRUE WHERE ${isFalse[db.dialect]("seen")} AND message_id IN (${placesFor(ids)})
     AND message_id IN (SELECT id FROM messages WHERE author_name = ?)`,
    ...ids,
    author,
  );
}

function sqlReactions(db: SqlDatabase): ReactionsSection {
  return {
    addReaction: (adding) => add(db, adding),
    listReactions: (ids) => list(db, ids),
    listUnseenReactions: (author) => unseen(db, author),
    markReactionsSeen: (author, ids) => markSeen(db, author, ids),
    removeReaction: (key) => remove(db, key),
  };
}

export { REACTIONS_MIGRATION, sqlReactions };
