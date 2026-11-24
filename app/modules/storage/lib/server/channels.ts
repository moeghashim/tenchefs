import { Array as Arr, Effect, Order, Schema } from "effect";
import type { Channel, ChannelName } from "../../../channels/index.ts";
import type { AttachmentId } from "../../../attachments/index.ts";
import type { IdentityName } from "../../../identities/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { MemoryState } from "./memory-state.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isAttachmentId } from "../../../attachments/index.ts";
import { isChannelName } from "../../../channels/index.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface ChannelsSection {
  readonly createChannel: (channel: Channel, creator?: IdentityName) => Fails<"created" | "name_taken">;
  readonly listChannels: () => Fails<readonly Channel[]>;
  readonly findChannel: (name: ChannelName) => Fails<Channel | undefined>;
  readonly deleteChannel: (name: ChannelName) => Fails<DeletedChannel | undefined>;
}

interface DeletedChannel {
  readonly channel: Channel;
  readonly attachments: readonly AttachmentId[];
}

type MemoryChannelsSection = Omit<ChannelsSection, "deleteChannel"> & {
  readonly forgetChannel: (name: ChannelName) => void;
};

const CHANNEL_COLUMNS = "name, description, created_at";

const byName: Order.Order<Channel> = Order.mapInput(Order.String, (channel: Channel) => channel.name);

const ChannelRow = Schema.Struct({
  created_at: IsoTimeSchema,
  description: Schema.NullOr(Schema.String),
  name: Schema.String.pipe(Schema.refine(isChannelName)),
});

type ChannelRowType = typeof ChannelRow.Type;

function memoryChannels(state: MemoryState): MemoryChannelsSection {
  const channels = new Map<ChannelName, Channel>();
  function open<Value>(work: () => Value): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Effect.sync(work));
  }
  function create(channel: Channel): "created" | "name_taken" {
    if (channels.has(channel.name)) {
      return "name_taken";
    }
    channels.set(channel.name, channel);
    return "created";
  }
  return {
    createChannel: (channel) => open(() => create(channel)),
    findChannel: (name) => open(() => channels.get(name)),
    forgetChannel: (name) => {
      channels.delete(name);
    },
    listChannels: () => open(() => Arr.sort(channels.values(), byName)),
  };
}

function fromRow({ created_at: createdAt, description, name }: ChannelRowType): Channel {
  if (typeof description === "string") {
    return { createdAt, description, name };
  }
  return { createdAt, name };
}

function toChannel(row: unknown): Fails<Channel> {
  return Schema.decodeUnknownEffect(ChannelRow)(row).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: fromRow }),
  );
}

function insert(db: SqlDatabase, channel: Channel): Fails<void> {
  if (typeof channel.description === "string") {
    return db.run(
      "INSERT INTO channels (name, description, created_at) VALUES (?, ?, ?)",
      channel.name,
      channel.description,
      channel.createdAt,
    );
  }
  return db.run("INSERT INTO channels (name, created_at) VALUES (?, ?)", channel.name, channel.createdAt);
}

const IN_CHANNEL = "SELECT id FROM messages WHERE channel = ?";

const ATTACHMENTS_IN_CHANNEL = `SELECT id FROM attachments WHERE message_id IN (${IN_CHANNEL})
  ORDER BY message_id, position`;

const AttachmentIdRow = Schema.Struct({ id: Schema.String.pipe(Schema.refine(isAttachmentId)) });

const CHANNEL_DELETES: readonly string[] = [
  `DELETE FROM message_mentions WHERE message_id IN (${IN_CHANNEL})`,
  `DELETE FROM read_receipts WHERE message_id IN (${IN_CHANNEL})`,
  `DELETE FROM reactions WHERE message_id IN (${IN_CHANNEL})`,
  `DELETE FROM attachments WHERE message_id IN (${IN_CHANNEL})`,
  `DELETE FROM follows WHERE thread_id IN (${IN_CHANNEL})`,
  `DELETE FROM thread_read_positions WHERE thread_id IN (${IN_CHANNEL})`,
  `DELETE FROM command_tokens WHERE thread_id IN (${IN_CHANNEL})`,
  "DELETE FROM deliveries WHERE channel = ?",
  "DELETE FROM subscriptions WHERE channel = ?",
  "DELETE FROM channel_read_positions WHERE channel = ?",
  "DELETE FROM scheduled_messages WHERE channel = ?",
  "DELETE FROM messages WHERE channel = ? AND reply_to IS NOT NULL",
  "DELETE FROM messages WHERE channel = ?",
  "DELETE FROM channels WHERE name = ?",
];

function toAttachmentId(row: unknown): Fails<AttachmentId> {
  return Schema.decodeUnknownEffect(AttachmentIdRow)(row).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: ({ id }) => id }),
  );
}

function attachmentsIn(db: SqlDatabase, name: ChannelName): Fails<readonly AttachmentId[]> {
  return db
    .all(ATTACHMENTS_IN_CHANNEL, name)
    .pipe(Effect.flatMap((rows) => Effect.forEach(rows, toAttachmentId, { concurrency: 1 })));
}

function sqlChannels(db: SqlDatabase): ChannelsSection {
  function find(name: ChannelName): Fails<Channel | undefined> {
    return db.get(`SELECT ${CHANNEL_COLUMNS} FROM channels WHERE name = ?`, name).pipe(
      Effect.flatMap((row) => {
        if (typeof row === "object" && row !== null) {
          return toChannel(row);
        }
        return Effect.undefined;
      }),
    );
  }
  return {
    createChannel: (channel, creator) =>
      db.transaction(
        Effect.gen(function* createChannel() {
          const existing = yield* find(channel.name);
          if (typeof existing === "object") {
            return "name_taken" as const;
          }
          yield* insert(db, channel);
          if (typeof creator === "string") {
            yield* db.run("INSERT INTO subscriptions (identity_name, channel) VALUES (?, ?)", creator, channel.name);
          }
          return "created" as const;
        }),
      ),
    deleteChannel: (name) =>
      db.transaction(
        Effect.gen(function* deleteChannel() {
          const found = yield* find(name);
          if (typeof found !== "object") {
            return found;
          }
          const attachments = yield* attachmentsIn(db, name);
          yield* Effect.forEach(CHANNEL_DELETES, (sql) => db.run(sql, name), { concurrency: 1, discard: true });
          return { attachments, channel: found };
        }),
      ),
    findChannel: find,
    listChannels: () =>
      db
        .all(`SELECT ${CHANNEL_COLUMNS} FROM channels ORDER BY name`)
        .pipe(Effect.flatMap((rows) => Effect.forEach(rows, (row) => toChannel(row), { concurrency: 1 }))),
  };
}

export {
  CHANNEL_COLUMNS,
  type ChannelsSection,
  type DeletedChannel,
  type MemoryChannelsSection,
  memoryChannels,
  sqlChannels,
  toChannel,
};
