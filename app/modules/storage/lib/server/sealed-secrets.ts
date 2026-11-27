import { Array as Arr, Effect, Option, Schema } from "effect";
import type { Fails, StorageUnavailable } from "./errors.ts";
import type { SecretsCipher } from "../../../secrets/server.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { unreadable } from "./errors.ts";

type SealSecretsResult = "sealed" | "unchanged" | "other_key";

class SecretsKeyMismatch extends Schema.TaggedError<SecretsKeyMismatch, { readonly brand: unique symbol }>()(
  "SecretsKeyMismatch",
  {
    message: Schema.String,
  },
) {}

const keyMismatch = SecretsKeyMismatch.make({
  message: "The store's secrets were sealed with another COOKOUT_SECRETS_KEY than this one.",
});

interface SealedSecretsSection {
  readonly sealSecrets: Effect.Effect<SealSecretsResult, StorageUnavailable>;
}

interface SealingDatabase {
  readonly db: SqlDatabase;
  readonly cipher: SecretsCipher;
}

interface SentHeader {
  readonly name: string;
  readonly value: string;
}

const HeaderValues = Schema.fromJsonString(Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.String })));

const decodeHeaders = Schema.decodeUnknownEffect(HeaderValues);
const encodeHeaders = Schema.encodeEffect(HeaderValues);

const KeyCheckRow = Schema.Struct({ key_check: Schema.String });
const TriggerSecretsRow = Schema.Struct({ agent_name: Schema.String, headers: Schema.String, token: Schema.String });
const WebhookCommandSecretRow = Schema.Struct({ name: Schema.String, secret: Schema.String });
const ONE_AT_A_TIME = { concurrency: 1, discard: true } as const;

function sealedValues(cipher: SecretsCipher, headers: readonly SentHeader[]): readonly SentHeader[] {
  return Arr.map(headers, ({ name, value }) => ({ name, value: cipher.seal(value) }));
}

function sealedHeaders(cipher: SecretsCipher): (json: string) => Fails<string> {
  return (json) =>
    Effect.flatMap(Effect.mapError(decodeHeaders(json), unreadable), (headers) =>
      Effect.mapError(encodeHeaders(sealedValues(cipher, headers)), unreadable),
    );
}

function openedSecret(cipher: SecretsCipher): (sealed: string) => Fails<string> {
  return (sealed) => Effect.mapError(Effect.fromOption(cipher.open(sealed)), unreadable);
}

function openedHeaders(cipher: SecretsCipher): (headers: readonly SentHeader[]) => Fails<readonly SentHeader[]> {
  const open = openedSecret(cipher);
  return (headers) =>
    Effect.forEach(headers, ({ name, value }) => Effect.map(open(value), (opened) => ({ name, value: opened })), {
      concurrency: 1,
    });
}

function rowsOf<Row>(db: SqlDatabase, sql: string, row: Schema.Codec<Row>): Fails<readonly Row[]> {
  return Effect.flatMap(db.all(sql), (found) =>
    Effect.mapError(Schema.decodeUnknownEffect(Schema.Array(row))(found), unreadable),
  );
}

function sealTriggers({ cipher, db }: SealingDatabase): Fails<void> {
  const sealHeaders = sealedHeaders(cipher);
  return Effect.flatMap(rowsOf(db, "SELECT agent_name, token, headers FROM triggers", TriggerSecretsRow), (rows) =>
    Effect.forEach(
      rows,
      ({ agent_name: agent, headers, token }) =>
        Effect.flatMap(sealHeaders(headers), (sealed) =>
          db.run("UPDATE triggers SET token = ?, headers = ? WHERE agent_name = ?", cipher.seal(token), sealed, agent),
        ),
      ONE_AT_A_TIME,
    ),
  );
}

function sealWebhookCommands({ cipher, db }: SealingDatabase): Fails<void> {
  return Effect.flatMap(rowsOf(db, "SELECT name, secret FROM commands", WebhookCommandSecretRow), (rows) =>
    Effect.forEach(
      rows,
      ({ name, secret }) => db.run("UPDATE commands SET secret = ? WHERE name = ?", cipher.seal(secret), name),
      ONE_AT_A_TIME,
    ),
  );
}

function recordedKeyCheck(db: SqlDatabase): Fails<Option.Option<string>> {
  return Effect.map(rowsOf(db, "SELECT key_check FROM secrets_key", KeyCheckRow), (found) =>
    Option.map(Arr.head(found), ({ key_check: check }) => check),
  );
}

function checked(recorded: string, cipher: SecretsCipher): SealSecretsResult {
  if (recorded === cipher.keyCheck) {
    return "unchanged";
  }
  return "other_key";
}

function sqlSealedSecrets(sealing: SealingDatabase): SealedSecretsSection {
  const { cipher, db } = sealing;
  const sealAll = Effect.gen(function* sealSecretsInDatabase() {
    yield* sealTriggers(sealing);
    yield* sealWebhookCommands(sealing);
    yield* db.run("INSERT INTO secrets_key (only_row, key_check) VALUES (1, ?)", cipher.keyCheck);
    return "sealed" as const;
  });
  return {
    sealSecrets: db.transaction(
      Effect.flatMap(recordedKeyCheck(db), (recorded) =>
        Option.match(recorded, {
          onNone: () => sealAll,
          onSome: (check) => Effect.succeed(checked(check, cipher)),
        }),
      ),
    ),
  };
}

const SECRETS_KEY_MIGRATION = `CREATE TABLE secrets_key (
     only_row INTEGER PRIMARY KEY CHECK (only_row = 1),
     key_check TEXT NOT NULL
   ) STRICT;`;

const POSTGRES_SECRETS_KEY_MIGRATION: readonly string[] = [
  `CREATE TABLE secrets_key (
     only_row integer PRIMARY KEY CHECK (only_row = 1),
     key_check text COLLATE "C" NOT NULL
   )`,
];

export {
  keyMismatch,
  POSTGRES_SECRETS_KEY_MIGRATION,
  SecretsKeyMismatch,
  SECRETS_KEY_MIGRATION,
  type SealedSecretsSection,
  type SealingDatabase,
  openedHeaders,
  openedSecret,
  sqlSealedSecrets,
};
