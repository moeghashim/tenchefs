import { Config, Redacted, Schema } from "effect";
import { isSecretsKey } from "../../../secrets/server.ts";

const secretsKeyRule =
  "COOKOUT_SECRETS_KEY must be set to 32 random bytes as hex or base64, such as one made by `openssl rand -hex 32`. It encrypts trigger tokens and Webhook command secrets at rest: keep it with the database, as without it they can't be read.";

const isSecretsKeyText = Schema.makeFilter((key: string) => isSecretsKey(key) || secretsKeyRule);

const secretsKey = Config.schema(Schema.String.check(isSecretsKeyText), "COOKOUT_SECRETS_KEY").pipe(
  Config.map((value) => Redacted.make(value)),
);

export { secretsKey, secretsKeyRule };
