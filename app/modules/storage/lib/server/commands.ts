import type { AgentIdentity, IdentityName } from "../../../identities/index.ts";
import { Array as Arr, Effect, Order, Predicate, Schema } from "effect";
import type { CommandName, CommandSecret, RegisteredCommand } from "../../../commands/index.ts";
import type { CommandTokensSection, MemoryCommandTokensSection } from "./command-tokens.ts";
import type { DeliveriesSection, MemoryDeliveriesSection } from "./deliveries.ts";
import { isCommandName, isCommandSecret } from "../../../commands/index.ts";
import { memoryCommandTokens, sqlCommandTokens } from "./command-tokens.ts";
import { memoryDeliveries, sqlDeliveries } from "./deliveries.ts";
import { FALSE } from "./adapters/sql-database.ts";
import type { FindIdentity } from "./identity-row.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { MemoryState } from "./memory-state.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { StorageUnavailable } from "./errors.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface StoredCommand {
  readonly command: RegisteredCommand;
  readonly secret: CommandSecret;
}

type AddCommandResult = "added" | "name_taken" | "handler_is_human";

interface CommandsSection extends CommandTokensSection, DeliveriesSection {
  readonly addCommand: (stored: StoredCommand, handler: AgentIdentity) => Fails<AddCommandResult>;
  readonly listCommands: Effect.Effect<readonly RegisteredCommand[], StorageUnavailable>;
  readonly findCommand: (name: CommandName) => Fails<StoredCommand | undefined>;
  readonly replaceCommandSecret: (name: CommandName, secret: CommandSecret) => Fails<StoredCommand | undefined>;
}

type PlaceHandler = (handler: AgentIdentity) => "placed" | "human";

const byName: Order.Order<StoredCommand> = Order.mapInput(Order.String, (stored: StoredCommand) => stored.command.name);

interface MemoryCommandsOptions {
  readonly state: MemoryState;
  readonly placeHandler: PlaceHandler;
  readonly findIdentity: FindIdentity;
}

type MemoryCommandsSection = CommandsSection &
  Pick<MemoryCommandTokensSection, "dropCommandTokens" | "dropCommandTokensOf"> &
  Pick<MemoryDeliveriesSection, "dropDeliveries"> & {
    readonly dropCommandsOf: (handler: IdentityName) => void;
  };

function memoryCommands({ findIdentity, state, placeHandler }: MemoryCommandsOptions): MemoryCommandsSection {
  const commands = new Map<CommandName, StoredCommand>();
  function open<Value>(work: () => Value): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Effect.sync(work));
  }
  function add(stored: StoredCommand, handler: AgentIdentity): AddCommandResult {
    if (commands.has(stored.command.name)) {
      return "name_taken";
    }
    if (placeHandler(handler) === "human") {
      return "handler_is_human";
    }
    commands.set(stored.command.name, stored);
    return "added";
  }
  function replaceSecret(name: CommandName, secret: CommandSecret): StoredCommand | undefined {
    const found = commands.get(name);
    if (Predicate.isNotUndefined(found)) {
      const replaced = { ...found, secret };
      commands.set(name, replaced);
      return replaced;
    }
    return found;
  }
  const tokens = memoryCommandTokens({ findIdentity, state });
  const { dropDeliveriesOf, ...deliveries } = memoryDeliveries(state);
  function dropCommandsOf(handler: IdentityName): void {
    for (const [name, { command }] of commands) {
      if (command.handler === handler) {
        dropDeliveriesOf(name);
        commands.delete(name);
      }
    }
    tokens.dropCommandTokensOf(handler);
  }
  return {
    ...tokens,
    ...deliveries,
    addCommand: (stored, handler) => open(() => add(stored, handler)),
    dropCommandsOf,
    findCommand: (name) => open(() => commands.get(name)),
    listCommands: Effect.suspend(() =>
      open(() => Arr.map(Arr.sort(commands.values(), byName), ({ command }) => command)),
    ),
    replaceCommandSecret: (name, secret) => open(() => replaceSecret(name, secret)),
  };
}

const JsonSchemaFromText = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json));

const CommandRow = Schema.Struct({
  created_at: IsoTimeSchema,
  description: Schema.NullOr(Schema.String),
  handler_name: Schema.String.pipe(Schema.refine(isIdentityName)),
  name: Schema.String.pipe(Schema.refine(isCommandName)),
  schema: JsonSchemaFromText,
  secret: Schema.String.pipe(Schema.refine(isCommandSecret)),
  url: Schema.String,
});

const KindRow = Schema.Struct({ kind: Schema.Literals(["human", "agent"]) });

const COMMAND_COLUMNS = "name, url, schema, description, handler_name, secret, created_at";

function fromRow(row: typeof CommandRow.Type): StoredCommand {
  const fields = { createdAt: row.created_at, handler: row.handler_name, name: row.name, schema: row.schema };
  const withUrl = { ...fields, url: row.url };
  if (typeof row.description === "string") {
    return { command: { ...withUrl, description: row.description }, secret: row.secret };
  }
  return { command: withUrl, secret: row.secret };
}

function toStored(row: unknown): Fails<StoredCommand> {
  return Schema.decodeUnknownEffect(CommandRow)(row).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: fromRow }),
  );
}

const encodeSchema = Schema.encodeEffect(JsonSchemaFromText);

function insertCommand(db: SqlDatabase, { command, secret }: StoredCommand): Fails<void> {
  return Effect.flatMap(Effect.mapError(encodeSchema(command.schema), unreadable), (schema) =>
    db.run(
      `INSERT INTO commands (${COMMAND_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

function sqlCommands(db: SqlDatabase): CommandsSection {
  function find(name: CommandName): Fails<StoredCommand | undefined> {
    return db.get(`SELECT ${COMMAND_COLUMNS} FROM commands WHERE name = ?`, name).pipe(
      Effect.flatMap((row) => {
        if (typeof row === "object" && row !== null) {
          return toStored(row);
        }
        return Effect.undefined;
      }),
    );
  }
  return {
    ...sqlCommandTokens(db),
    ...sqlDeliveries(db),
    addCommand: (stored, handler) =>
      db.transaction(
        Effect.gen(function* addCommand() {
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
          yield* insertCommand(db, stored);
          return "added" as const;
        }),
      ),
    findCommand: find,
    listCommands: Effect.suspend(() =>
      db
        .all(`SELECT ${COMMAND_COLUMNS} FROM commands ORDER BY name`)
        .pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) => Effect.map(toStored(row), ({ command }) => command), { concurrency: 1 }),
          ),
        ),
    ),
    replaceCommandSecret: (name, secret) =>
      db.transaction(Effect.andThen(db.run("UPDATE commands SET secret = ? WHERE name = ?", secret, name), find(name))),
  };
}

export { type CommandsSection, type PlaceHandler, type StoredCommand, memoryCommands, sqlCommands };
