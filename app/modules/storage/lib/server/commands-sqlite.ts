import type { AgentIdentity, IdentityName } from "../../../identities/index.ts";
import { Effect, Option, Predicate, Schema } from "effect";
import type {
  RegisteredWebhookCommand,
  WebhookCommandName,
  WebhookCommandSecret,
} from "../../../webhook-commands/index.ts";
import type { StoredWebhookCommand, WebhookCommandsSection } from "./commands.ts";
import { isWebhookCommandName, isWebhookCommandSecret } from "../../../webhook-commands/index.ts";
import { FALSE } from "./adapters/sql-database.ts";
import type { Fails } from "./errors.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { SealingDatabase } from "./sealed-secrets.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { openedSecret } from "./sealed-secrets.ts";
import { sqlDeliveries } from "./deliveries.ts";
import { sqlWebhookCommandTokens } from "./command-tokens.ts";
import { unreadable } from "./errors.ts";

type SqlDatabase = SealingDatabase["db"];
type Cipher = SealingDatabase["cipher"];

const JsonSchemaFromText = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json));

const WebhookCommandRow = Schema.Struct({
  created_at: IsoTimeSchema,
  description: Schema.NullOr(Schema.String),
  handler_name: Schema.String.pipe(Schema.refine(isIdentityName)),
  name: Schema.String.pipe(Schema.refine(isWebhookCommandName)),
  schema: JsonSchemaFromText,
  secret: Schema.String,
  url: Schema.String,
});

const KindRow = Schema.Struct({ kind: Schema.Literals(["human", "agent"]) });

const WEBHOOK_COMMAND_COLUMNS = "name, url, schema, description, handler_name, secret, created_at";

function commandFrom(row: typeof WebhookCommandRow.Type): RegisteredWebhookCommand {
  const fields = { createdAt: row.created_at, handler: row.handler_name, name: row.name, schema: row.schema };
  const withUrl = { ...fields, url: row.url };
  if (typeof row.description === "string") {
    return { ...withUrl, description: row.description };
  }
  return withUrl;
}

function secretOf(cipher: Cipher): (sealed: string) => Fails<WebhookCommandSecret> {
  const open = openedSecret(cipher);
  return (sealed) =>
    Effect.flatMap(open(sealed), (secret) =>
      Effect.mapError(Effect.fromOption(Option.liftPredicate(secret, isWebhookCommandSecret)), unreadable),
    );
}

function storedOf(cipher: Cipher): (row: unknown) => Fails<StoredWebhookCommand> {
  const openSecret = secretOf(cipher);
  return (row) =>
    Effect.flatMap(Effect.mapError(Schema.decodeUnknownEffect(WebhookCommandRow)(row), unreadable), (decoded) =>
      Effect.map(openSecret(decoded.secret), (secret) => ({ command: commandFrom(decoded), secret })),
    );
}

function commandOf(row: unknown): Fails<RegisteredWebhookCommand> {
  return Schema.decodeUnknownEffect(WebhookCommandRow)(row).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: commandFrom }),
  );
}

const encodeSchema = Schema.encodeEffect(JsonSchemaFromText);

function insertWebhookCommand(db: SqlDatabase, cipher: Cipher, { command, secret }: StoredWebhookCommand): Fails<void> {
  return Effect.flatMap(Effect.mapError(encodeSchema(command.schema), unreadable), (schema) =>
    db.run(
      `INSERT INTO commands (${WEBHOOK_COMMAND_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      command.name,
      command.url,
      schema,
      command.description ?? null,
      command.handler,
      cipher.seal(secret),
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

function sqlWebhookCommands({ cipher, db }: SealingDatabase): WebhookCommandsSection {
  const toStored = storedOf(cipher);
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
          yield* insertWebhookCommand(db, cipher, stored);
          return "added" as const;
        }),
      ),
    findWebhookCommand: find,
    listWebhookCommands: Effect.suspend(() =>
      db
        .all(`SELECT ${WEBHOOK_COMMAND_COLUMNS} FROM commands ORDER BY name`)
        .pipe(Effect.flatMap((rows) => Effect.forEach(rows, commandOf, { concurrency: 1 }))),
    ),
    replaceWebhookCommandSecret: (name, secret) => {
      const replaced = db.run("UPDATE commands SET secret = ? WHERE name = ?", cipher.seal(secret), name);
      return db.transaction(Effect.andThen(replaced, find(name)));
    },
  };
}

export { sqlWebhookCommands };
