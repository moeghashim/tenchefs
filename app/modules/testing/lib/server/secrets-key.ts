import { Option, Redacted } from "effect";
import type { SecretsCipher } from "../../../secrets/server.ts";
import { secretsCipher } from "../../../secrets/server.ts";

const testSecretsKey = "7465737420736563726574732b6b6579207468617420697320333220627974e5";

const otherSecretsKey = "6f7468657220736563726574732b6b6579207468617420697320333220627974";

function cipherOf(key: string): SecretsCipher {
  return Option.getOrThrow(secretsCipher(Redacted.make(key)));
}

const testSecretsCipher: SecretsCipher = cipherOf(testSecretsKey);

const otherSecretsCipher: SecretsCipher = cipherOf(otherSecretsKey);

const plaintextCipher: SecretsCipher = { keyCheck: "plaintext", open: Option.some, seal: (plain) => plain };

export { otherSecretsCipher, otherSecretsKey, plaintextCipher, testSecretsCipher, testSecretsKey };
