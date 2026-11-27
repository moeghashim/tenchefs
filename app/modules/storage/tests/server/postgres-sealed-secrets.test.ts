import { Array as Arr, Effect, Schema, String as Str } from "effect";
import {
  emptyPostgresDatabase,
  handlerFixture,
  identityFixture,
  onPostgresDatabase,
  openStore,
  plaintextCipher,
  postgresRows,
  testSecretsCipher,
  triggerToken,
  webhookCommandFixture,
  webhookCommandName,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Redacted } from "effect";
import type { StorageUnavailable } from "../../server.ts";
import { postgresStorage } from "../../server.ts";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const BEFORE_SECRETS_KEY = [
  "DROP TABLE login_links",
  "ALTER TABLE login_requests DROP COLUMN kind",
  "DROP TABLE credential_lineage",
  "ALTER TABLE login_requests DROP COLUMN approved_with",
  "ALTER TABLE agent_join_requests DROP COLUMN approved_with",
  "ALTER TABLE login_requests DROP COLUMN client_ip, DROP COLUMN user_agent",
  "ALTER TABLE agent_join_requests DROP COLUMN client_ip, DROP COLUMN user_agent",
  "DROP TABLE secrets_key",
  "UPDATE schema_version SET version = version - 5",
];
const TRIGGER_TOKEN = triggerToken("routine-token-5d2a");
const HEADERS = [{ name: "x-routine-key", value: "header-secret-7e10" }];
const COMMAND_SECRET = "hmac_deploy-secret-31c4";
const PLAINTEXT_SECRETS = ["routine-token-5d2a", "header-secret-7e10", COMMAND_SECRET];
const RAW_SECRETS = "SELECT token || headers AS raw FROM triggers UNION ALL SELECT secret FROM commands";
const ada = identityFixture("ada", { kind: "human" });
const triage = identityFixture("triage", { owner: "ada" });
const deploy = webhookCommandFixture("deploy", { secret: COMMAND_SECRET });
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));
const encodeRows = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

const secretsStoredBeforeEncryption = Effect.gen(function* storePlaintextSecrets() {
  const url = yield* emptyPostgresDatabase;
  const { close, storage } = yield* openStore(postgresStorage({ cipher: plaintextCipher, url }));
  yield* storage.createIdentity(ada, hashA);
  yield* storage.createIdentity(triage, hashB);
  yield* storage.setTrigger(triage.name, { headers: HEADERS, token: TRIGGER_TOKEN, url: "https://routines.test/fire" });
  yield* storage.addWebhookCommand(deploy, handlerFixture("deploy"));
  yield* close;
  yield* onPostgresDatabase({ statements: BEFORE_SECRETS_KEY, url });
  return url;
});

function plaintextLeft(url: Redacted.Redacted): Effect.Effect<readonly string[], StorageUnavailable> {
  return Effect.gen(function* readRawSecrets() {
    const rows = yield* postgresRows({ statement: RAW_SECRETS, url });
    const raw = yield* Effect.orDie(encodeRows(rows));
    return Arr.filter(PLAINTEXT_SECRETS, (secret) => Str.includes(secret)(raw));
  });
}

it.effect(
  "trigger tokens, header values and Webhook command secrets stored before encryption are sealed by the first boot with a key and read back",
  () =>
    Effect.scoped(
      Effect.gen(function* sealBeforeSecretsKey() {
        const url = yield* secretsStoredBeforeEncryption;
        const { close, storage } = yield* openStore(postgresStorage({ cipher: testSecretsCipher, url }));
        const [sealed, found, trigger] = yield* Effect.all(
          [
            storage.sealSecrets,
            storage.findWebhookCommand(webhookCommandName("deploy")),
            storage.findTrigger(triage.name),
          ],
          { concurrency: 1 },
        );
        yield* close;
        const left = yield* plaintextLeft(url);

        expect({ found, left, sealed, trigger }).toMatchObject({
          found: { secret: COMMAND_SECRET },
          left: [],
          sealed: "sealed",
          trigger: { headers: HEADERS, token: TRIGGER_TOKEN },
        });
      }),
    ),
);
