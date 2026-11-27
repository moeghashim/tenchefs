import { Array as Arr, Effect, Predicate, Schema } from "effect";
import type { CallId, WebhookCommandName } from "../../../webhook-commands/index.ts";
import type { DialectForms, SqlDatabase } from "./adapters/sql-database.ts";
import type { JsonValue, MessageId } from "../../../messages/index.ts";
import { isCallId, isWebhookCommandName } from "../../../webhook-commands/index.ts";
import type { ChannelName } from "../../../channels/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { MemoryState } from "./memory-state.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isChannelName } from "../../../channels/index.ts";
import { isMessageId } from "../../../messages/index.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;
type DeliveryOutcome = "pending" | "delivered" | "failed";
interface DeliveryProgress {
  readonly attempts: number;
  readonly nextAttemptAt: IsoTime;
  readonly outcome: DeliveryOutcome;
}
interface StoredDelivery extends DeliveryProgress {
  readonly callId: CallId;
  readonly command: WebhookCommandName;
  readonly channel: ChannelName;
  readonly threadId: MessageId;
  readonly data: JsonValue;
  readonly calledAt: IsoTime;
}

interface DeliveriesSection {
  readonly addDelivery: (delivery: StoredDelivery) => Fails<void>;
  readonly updateDelivery: (callId: CallId, progress: DeliveryProgress) => Fails<void>;
  readonly listPendingDeliveries: Effect.Effect<readonly StoredDelivery[], StorageUnavailable>;
}

type MemoryDeliveriesSection = DeliveriesSection & {
  readonly dropDeliveries: (channel: ChannelName) => void;
  readonly dropDeliveriesOf: (command: WebhookCommandName) => void;
};

function memoryDeliveries(state: MemoryState): MemoryDeliveriesSection {
  const deliveries = new Map<CallId, StoredDelivery>();
  function open<Value>(work: () => Value): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Effect.sync(work));
  }
  return {
    addDelivery: (delivery) =>
      open(() => {
        deliveries.set(delivery.callId, { ...delivery });
      }),
    dropDeliveries: (channel) => {
      for (const [callId, delivery] of deliveries) {
        if (delivery.channel === channel) {
          deliveries.delete(callId);
        }
      }
    },
    dropDeliveriesOf: (command) => {
      for (const [callId, delivery] of deliveries) {
        if (delivery.command === command) {
          deliveries.delete(callId);
        }
      }
    },
    listPendingDeliveries: Effect.suspend(() =>
      open(() => Arr.filter([...deliveries.values()], ({ outcome }) => outcome === "pending")),
    ),
    updateDelivery: (callId, progress) =>
      open(() => {
        const found = deliveries.get(callId);
        if (Predicate.isNotUndefined(found)) {
          deliveries.set(callId, { ...found, ...progress });
        }
      }),
  };
}

const JsonText = Schema.fromJsonString(Schema.Json);

const DeliveryRow = Schema.Struct({
  attempts: Schema.Int,
  call_id: Schema.String.pipe(Schema.refine(isCallId)),
  called_at: IsoTimeSchema,
  channel: Schema.String.pipe(Schema.refine(isChannelName)),
  command: Schema.String.pipe(Schema.refine(isWebhookCommandName)),
  data: JsonText,
  next_attempt_at: IsoTimeSchema,
  outcome: Schema.Literals(["pending", "delivered", "failed"]),
  thread_id: Schema.Int.pipe(Schema.refine(isMessageId)),
});

function fromRow(row: typeof DeliveryRow.Type): StoredDelivery {
  return {
    attempts: row.attempts,
    callId: row.call_id,
    calledAt: row.called_at,
    channel: row.channel,
    command: row.command,
    data: row.data,
    nextAttemptAt: row.next_attempt_at,
    outcome: row.outcome,
    threadId: row.thread_id,
  };
}

const decodeRow = Schema.decodeUnknownEffect(DeliveryRow);
const encodeData = Schema.encodeEffect(JsonText);

const DELIVERY_COLUMNS = "call_id, command, channel, thread_id, data, attempts, next_attempt_at, outcome, called_at";

const PENDING: DialectForms<string> = {
  postgres: `SELECT ${DELIVERY_COLUMNS} FROM deliveries WHERE outcome = 'pending' ORDER BY added_order`,
  sqlite: `SELECT ${DELIVERY_COLUMNS} FROM deliveries WHERE outcome = 'pending' ORDER BY rowid`,
};

function sqlDeliveries(db: SqlDatabase): DeliveriesSection {
  return {
    addDelivery: (delivery) =>
      Effect.flatMap(Effect.mapError(encodeData(delivery.data), unreadable), (data) =>
        db.run(
          `INSERT INTO deliveries (${DELIVERY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          delivery.callId,
          delivery.command,
          delivery.channel,
          delivery.threadId,
          data,
          delivery.attempts,
          delivery.nextAttemptAt,
          delivery.outcome,
          delivery.calledAt,
        ),
      ),
    listPendingDeliveries: Effect.suspend(() =>
      db.all(PENDING[db.dialect]).pipe(
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) => Effect.mapBoth(decodeRow(row), { onFailure: unreadable, onSuccess: fromRow }), {
            concurrency: 1,
          }),
        ),
      ),
    ),
    updateDelivery: (callId, { attempts, nextAttemptAt, outcome }) =>
      db.run(
        "UPDATE deliveries SET attempts = ?, next_attempt_at = ?, outcome = ? WHERE call_id = ?",
        attempts,
        nextAttemptAt,
        outcome,
        callId,
      ),
  };
}

const CALL_TIMES_BACKFILL =
  "UPDATE deliveries SET called_at = (SELECT created_at FROM messages WHERE messages.id = deliveries.thread_id)";

const CALL_TIMES_MIGRATION = `ALTER TABLE deliveries ADD COLUMN called_at TEXT;
   ${CALL_TIMES_BACKFILL};`;

const POSTGRES_CALL_TIMES_MIGRATION: readonly string[] = [
  'ALTER TABLE deliveries ADD COLUMN called_at text COLLATE "C"',
  CALL_TIMES_BACKFILL,
];

export {
  CALL_TIMES_MIGRATION,
  POSTGRES_CALL_TIMES_MIGRATION,
  type DeliveriesSection,
  type DeliveryOutcome,
  type MemoryDeliveriesSection,
  type StoredDelivery,
  memoryDeliveries,
  sqlDeliveries,
};
