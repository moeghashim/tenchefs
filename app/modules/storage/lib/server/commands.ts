import type { AgentIdentity, IdentityName } from "../../../identities/index.ts";
import { Array as Arr, Effect, Order, Predicate, Schema } from "effect";
import type { DeliveriesSection, MemoryDeliveriesSection } from "./deliveries.ts";
import type { MemoryWebhookCommandTokensSection, WebhookCommandTokensSection } from "./command-tokens.ts";
import type {
  RegisteredWebhookCommand,
  WebhookCommandName,
  WebhookCommandSecret,
} from "../../../webhook-commands/index.ts";
import { isWebhookCommandName, isWebhookCommandSecret } from "../../../webhook-commands/index.ts";
import { memoryDeliveries, sqlDeliveries } from "./deliveries.ts";
import { memoryWebhookCommandTokens, sqlWebhookCommandTokens } from "./command-tokens.ts";
import { FALSE } from "./adapters/sql-database.ts";
import type { FindIdentity } from "./identity-row.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { MemoryState } from "./memory-state.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface StoredWebhookCommand {
  readonly command: RegisteredWebhookCommand;
  readonly secret: WebhookCommandSecret;
}

type AddWebhookCommandResult = "added" | "name_taken" | "handler_is_human";

interface WebhookCommandsSection extends WebhookCommandTokensSection, DeliveriesSection {
  readonly addWebhookCommand: (stored: StoredWebhookCommand, handler: AgentIdentity) => Fails<AddWebhookCommandResult>;
  readonly listWebhookCommands: Effect.Effect<readonly RegisteredWebhookCommand[], StorageUnavailable>;
  readonly findWebhookCommand: (name: WebhookCommandName) => Fails<StoredWebhookCommand | undefined>;
  readonly replaceWebhookCommandSecret: (
    name: WebhookCommandName,
    secret: WebhookCommandSecret,
  ) => Fails<StoredWebhookCommand | undefined>;
}

type PlaceHandler = (handler: AgentIdentity) => "placed" | "human";

const byName: Order.Order<StoredWebhookCommand> = Order.mapInput(
  Order.String,
  (stored: StoredWebhookCommand) => stored.command.name,
);

interface MemoryWebhookCommandsOptions {
  readonly state: MemoryState;
  readonly placeHandler: PlaceHandler;
  readonly findIdentity: FindIdentity;
}

interface MemoryWebhookCommandsSection
  extends WebhookCommandsSection,
    Pick<MemoryWebhookCommandTokensSection, "dropWebhookCommandTokens" | "dropWebhookCommandTokensOf">,
    Pick<MemoryDeliveriesSection, "dropDeliveries"> {
  readonly dropWebhookCommandsOf: (handler: IdentityName) => void;
}

function memoryWebhookCommands(options: MemoryWebhookCommandsOptions): MemoryWebhookCommandsSection {
  const { findIdentity, state, placeHandler } = options;
  const commands = new Map<WebhookCommandName, StoredWebhookCommand>();
  function open<Value>(work: () => Value): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Effect.sync(work));
  }
  function add(stored: StoredWebhookCommand, handler: AgentIdentity): AddWebhookCommandResult {
    if (commands.has(stored.command.name)) {
      return "name_taken";
    }
    if (placeHandler(handler) === "human") {
      return "handler_is_human";
    }
    commands.set(stored.command.name, stored);
    return "added";
  }
  function replaceSecret(name: WebhookCommandName, secret: WebhookCommandSecret): StoredWebhookCommand | undefined {
    const found = commands.get(name);
    if (Predicate.isNotUndefined(found)) {
      const replaced = { ...found, secret };
      commands.set(name, replaced);
      return replaced;
    }
    return found;
  }
  const tokens = memoryWebhookCommandTokens({ findIdentity, state });
  const { dropDeliveriesOf, ...deliveries } = memoryDeliveries(state);
  function dropWebhookCommandsOf(handler: IdentityName): void {
    for (const [name, { command }] of commands) {
      if (command.handler === handler) {
        dropDeliveriesOf(name);
        commands.delete(name);
      }
    }
    tokens.dropWebhookCommandTokensOf(handler);
  }
  return {
    ...tokens,
    ...deliveries,
    addWebhookCommand: (stored, handler) => open(() => add(stored, handler)),
    dropWebhookCommandsOf,
    findWebhookCommand: (name) => open(() => commands.get(name)),
    listWebhookCommands: Effect.suspend(() =>
      open(() => Arr.map(Arr.sort(commands.values(), byName), ({ command }) => command)),
    ),
    replaceWebhookCommandSecret: (name, secret) => open(() => replaceSecret(name, secret)),
  };
}

const JsonSchemaFromText = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json));

const WebhookCommandRow = Schema.Struct({
  created_at: IsoTimeSchema,
  description: Schema.NullOr(Schema.String),
  handler_name: Schema.String.pipe(Schema.refine(isIdentityName)),
  name: Schema.String.pipe(Schema.refine(isWebhookCommandName)),
  schema: JsonSchemaFromText,
  secret: Schema.String.pipe(Schema.refine(isWebhookCommandSecret)),
  url: Schema.String,
});

const KindRow = Schema.Struct({ kind: Schema.Literals(["human", "agent"]) });

const WEBHOOK_COMMAND_COLUMNS = "name, url, schema, description, handler_name, secret, created_at";

function fromRow(row: typeof WebhookCommandRow.Type): StoredWebhookCommand {
  const fields = { createdAt: row.created_at, handler: row.handler_name, name: row.name, schema: row.schema };
  const withUrl = { ...fields, url: row.url };
  if (typeof row.description === "string") {
    return { command: { ...withUrl, description: row.description }, secret: row.secret };
  }
  return { command: withUrl, secret: row.secret };
}

function toStored(row: unknown): Fails<StoredWebhookCommand> {
  return Schema.decodeUnknownEffect(WebhookCommandRow)(row).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: fromRow }),
  );
}

const encodeSchema = Schema.encodeEffect(JsonSchemaFromText);

function insertWebhookCommand(db: SqlDatabase, { command, secret }: StoredWebhookCommand): Fails<void> {
  return Effect.flatMap(Effect.mapError(encodeSchema(command.schema), unreadable), (schema) =>
    db.run(
      `INSERT INTO commands (${WEBHOOK_COMMAND_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      command.name,
      command.url,
      schema,
      command.description ?? null,
      command.handler,
      secret,
      command.createdAt,
    ),
  );
}

function kindOf(db: SqlDatabase, name: IdentityName): Fails<"human" | "agent" | undefined> {
  return db.get("SELECT kind FROM identities WHERE name = ?", name).pipe(
    Effect.flatMap((row) => {
      if (typeof row === "object" && row !== null) {
        return Schema.decodeUnknownEffect(KindRow)(row).pipe(
          Effect.mapBoth({ onFailure: unreadable, onSuccess: ({ kind }) => kind }),
        );
      }
      return Effect.undefined;
    }),
  );
}

function insertHandler(db: SqlDatabase, handler: AgentIdentity): Fails<void> {
  return db.run(
    `INSERT INTO identities (name, kind, owner, admin, created_at) VALUES (?, 'agent', ?, ${FALSE[db.dialect]}, ?)`,
    handler.name,
    handler.owner,
    handler.createdAt,
  );
}

function sqlWebhookCommands(db: SqlDatabase): WebhookCommandsSection {
  function find(name: WebhookCommandName): Fails<StoredWebhookCommand | undefined> {
    return db.get(`SELECT ${WEBHOOK_COMMAND_COLUMNS} FROM commands WHERE name = ?`, name).pipe(
      Effect.flatMap((row) => {
        if (typeof row === "object" && row !== null) {
          return toStored(row);
        }
        return Effect.undefined;
      }),
    );
  }
  return {
    ...sqlWebhookCommandTokens(db),
    ...sqlDeliveries(db),
    addWebhookCommand: (stored, handler) =>
      db.transaction(
        Effect.gen(function* addWebhookCommand() {
          if (typeof (yield* find(stored.command.name)) === "object") {
            return "name_taken" as const;
          }
          const kind = yield* kindOf(db, handler.name);
          if (kind === "human") {
            return "handler_is_human" as const;
          }
          if (Predicate.isUndefined(kind)) {
            yield* insertHandler(db, handler);
          }
          yield* insertWebhookCommand(db, stored);
          return "added" as const;
        }),
      ),
    findWebhookCommand: find,
    listWebhookCommands: Effect.suspend(() =>
      db
        .all(`SELECT ${WEBHOOK_COMMAND_COLUMNS} FROM commands ORDER BY name`)
        .pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) => Effect.map(toStored(row), ({ command }) => command), { concurrency: 1 }),
          ),
        ),
    ),
    replaceWebhookCommandSecret: (name, secret) =>
      db.transaction(Effect.andThen(db.run("UPDATE commands SET secret = ? WHERE name = ?", secret, name), find(name))),
  };
}

export {
  type WebhookCommandsSection,
  type PlaceHandler,
  type StoredWebhookCommand,
  memoryWebhookCommands,
  sqlWebhookCommands,
};
