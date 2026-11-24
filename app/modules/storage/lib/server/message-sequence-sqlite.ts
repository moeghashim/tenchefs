import { Effect, Option, Schema } from "effect";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { MessageId } from "../../../messages/index.ts";
import { MessageIdColumn } from "./message-rows-sqlite.ts";
import type { NewMessage } from "./messages.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isMessageId } from "../../../messages/index.ts";
import { stampedAfter } from "./messages.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const TAKE_ID = `UPDATE message_id_sequence SET last_id = last_id + 1, latest_created_at = ?
  WHERE only_row = 1 RETURNING last_id`;

const SequenceRow = Schema.Struct({ last_id: MessageIdColumn });
const LatestRow = Schema.Struct({ last_id: Schema.Int });
const LatestStampRow = Schema.Struct({ latest_created_at: Schema.NullOr(IsoTimeSchema) });

interface Appending {
  readonly db: SqlDatabase;
  readonly message: NewMessage;
}

function stampedIn({ db, message }: Appending): Fails<NewMessage> {
  return db.get("SELECT latest_created_at FROM message_id_sequence WHERE only_row = 1").pipe(
    Effect.flatMap((row) => Schema.decodeUnknownEffect(LatestStampRow)(row).pipe(Effect.mapError(unreadable))),
    Effect.map((row) => stampedAfter({ latest: Option.fromNullishOr(row.latest_created_at), message })),
  );
}

function takeId({ db, message }: Appending): Fails<MessageId> {
  return db.get(TAKE_ID, message.createdAt).pipe(
    Effect.flatMap((row) => Schema.decodeUnknownEffect(SequenceRow)(row).pipe(Effect.mapError(unreadable))),
    Effect.map((row) => row.last_id),
  );
}

function latestOf(db: SqlDatabase): Fails<MessageId | undefined> {
  return db.get("SELECT last_id FROM message_id_sequence WHERE only_row = 1").pipe(
    Effect.flatMap((row) => Schema.decodeUnknownEffect(LatestRow)(row).pipe(Effect.mapError(unreadable))),
    Effect.map(({ last_id: last }) => Option.getOrUndefined(Option.liftPredicate(last, isMessageId))),
  );
}

export { latestOf, stampedIn, takeId };
