import { Effect, Option, Predicate } from "effect";
import type { Message, MessageId, Reply, TopLevelMessage } from "../../../messages/index.ts";
import type { MessagesSection, NewMessage, ThreadStateChange } from "./messages.ts";
import { closingBy, threadIdOf } from "./messages.ts";
import type { MessageReader } from "./inbox-sqlite.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { sqlOpenThreads } from "./open-threads-sqlite.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

type ClosedThreadsSection = Pick<MessagesSection, "closeThread" | "reopenThread" | "listOpenThreads">;

interface ClosedThreadsOptions {
  readonly db: SqlDatabase;
  readonly reader: MessageReader;
}

interface Changing extends ClosedThreadsOptions {
  readonly message: Message;
  readonly close: NewMessage["close"];
}

const CLOSE = "UPDATE messages SET closed_at = ?, closed_by = ? WHERE id = ? AND closed_at IS NULL RETURNING id";
const REOPEN =
  "UPDATE messages SET closed_at = NULL, closed_by = NULL WHERE id = ? AND closed_at IS NOT NULL RETURNING id";
const REOPEN_AT = `UPDATE messages SET closed_at = NULL, closed_by = NULL, reopened_at = ?
  WHERE id = ? AND closed_at IS NOT NULL RETURNING id`;

function isTopLevel(message: Message): message is TopLevelMessage {
  return message.kind === "top-level";
}

function parentOf(reader: MessageReader, id: MessageId): Fails<Option.Option<TopLevelMessage>> {
  return Effect.map(reader.findMessage(id), (found) => Option.filter(Option.fromUndefinedOr(found), isTopLevel));
}

function changeThread(
  { db, reader }: ClosedThreadsOptions,
  id: MessageId,
  change: (parent: MessageId) => Fails<unknown>,
): Fails<ThreadStateChange | undefined> {
  return Effect.gen(function* changeThreadState() {
    const found = yield* reader.findMessage(id);
    if (Predicate.isUndefined(found)) {
      return found;
    }
    const changed = yield* Effect.map(change(threadIdOf(found)), Predicate.isObject);
    const parent = yield* parentOf(reader, threadIdOf(found));
    return Option.getOrUndefined(Option.map(parent, (now) => ({ changed, parent: now })));
  }).pipe(db.transaction);
}

function changeFor(db: SqlDatabase, reply: Reply, close: NewMessage["close"]): Fails<unknown> {
  if (Predicate.isUndefined(close)) {
    return db.get(REOPEN, reply.replyTo);
  }
  const { closedAt, closedBy } = closingBy(reply);
  return db.get(CLOSE, closedAt, closedBy, reply.replyTo);
}

function threadChangedBy({ close, db, message, reader }: Changing): Fails<TopLevelMessage | undefined> {
  if (message.kind === "top-level") {
    return Effect.undefined;
  }
  return changeFor(db, message, close).pipe(
    Effect.flatMap((row) => {
      if (Predicate.isObject(row)) {
        return Effect.map(parentOf(reader, message.replyTo), Option.getOrUndefined);
      }
      return Effect.undefined;
    }),
  );
}

function sqlClosedThreads(options: ClosedThreadsOptions): ClosedThreadsSection {
  const { db } = options;
  return {
    ...sqlOpenThreads(options),
    closeThread: (id, { closedAt, closedBy }) =>
      changeThread(options, id, (parent) => db.get(CLOSE, closedAt, closedBy, parent)),
    reopenThread: (id, reopenedAt) => changeThread(options, id, (parent) => db.get(REOPEN_AT, reopenedAt, parent)),
  };
}

export { sqlClosedThreads, threadChangedBy };
