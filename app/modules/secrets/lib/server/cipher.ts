import { Array as Arr, Effect, Option, Redacted, String as Str } from "effect";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

interface SecretsCipher {
  readonly seal: (plain: string) => string;
  readonly open: (sealed: string) => Option.Option<string>;
  readonly keyCheck: string;
}

interface SealedParts {
  readonly iv: Uint8Array;
  readonly body: Uint8Array;
  readonly tag: Uint8Array;
}

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const SEALED_PREFIX = "sealed1";
const hexKey = /^[0-9a-f]{64}$/iv;
const sealedShape = /^sealed1\.[\w\-]+\.[\w\-]+$/v;
const KEY_CHECK_TEXT = "cookout secrets key check";

function keyBytes(key: string): Option.Option<Uint8Array> {
  if (hexKey.test(key)) {
    return Option.some(Buffer.from(key, "hex"));
  }
  const bytes: Uint8Array = Buffer.from(key, "base64");
  const canonical = Str.replace(/[=]+$/v, "")(Buffer.from(bytes).toString("base64url"));
  const given = Str.replace(/[=]+$/v, "")(Str.replaceAll("/", "_")(Str.replaceAll("+", "-")(key)));
  return Option.liftPredicate(bytes, (decoded) => decoded.length === KEY_BYTES && canonical === given);
}

function sealWith(key: Uint8Array): (plain: string) => string {
  return (plain) => {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const sealed = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
    return Arr.join([SEALED_PREFIX, iv.toString("base64url"), sealed.toString("base64url")], ".");
  };
}

function partsOf({ iv, text }: { readonly iv: string; readonly text: string }): Option.Option<SealedParts> {
  const bytes: Uint8Array = Buffer.from(text, "base64url");
  return Option.map(
    Option.liftPredicate(bytes, (decoded) => decoded.length >= TAG_BYTES),
    (decoded) => ({
      body: decoded.subarray(-decoded.length, -TAG_BYTES),
      iv: Buffer.from(iv, "base64url"),
      tag: decoded.subarray(-TAG_BYTES),
    }),
  );
}

function openParts(key: Uint8Array, { body, iv, tag }: SealedParts): string {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

const openSafely = Option.liftThrowable(openParts);

function openWith(key: Uint8Array): (sealed: string) => Option.Option<string> {
  return (sealed) => {
    if (!sealedShape.test(sealed)) {
      return Option.none();
    }
    const [, iv = "", text = ""] = Str.split(sealed, ".");
    return Option.flatMap(partsOf({ iv, text }), (parts) => openSafely(key, parts));
  };
}

function cipherOf(key: Uint8Array): SecretsCipher {
  return {
    keyCheck: createHmac("sha256", key).update(KEY_CHECK_TEXT).digest("hex"),
    open: openWith(key),
    seal: sealWith(key),
  };
}

function isSecretsKey(key: string): boolean {
  return Option.isSome(keyBytes(key));
}

function secretsCipher(key: Redacted.Redacted): Option.Option<SecretsCipher> {
  return Option.map(keyBytes(Redacted.value(key)), cipherOf);
}

const newSecretsKey: Effect.Effect<Redacted.Redacted> = Effect.sync(() =>
  Redacted.make(randomBytes(KEY_BYTES).toString("hex")),
);

export { type SecretsCipher, isSecretsKey, newSecretsKey, secretsCipher };
