import { Array as Arr, Effect, Option, String as Str } from "effect";
import type { CallId, CommandSecret } from "../../../commands/index.ts";
import type { Token, TokenHash } from "../../../identities/index.ts";
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { isCallId, isCommandSecret } from "../../../commands/index.ts";
import { token, tokenHash } from "../../../identities/index.ts";
import type { AttachmentId } from "../../../attachments/index.ts";
import { isAttachmentId } from "../../../attachments/index.ts";

interface LiveSecrets {
  readonly digest: (text: string) => Effect.Effect<string>;
  readonly newCallId: Effect.Effect<CallId>;
  readonly newAttachmentId: Effect.Effect<AttachmentId>;
  readonly newUserCode: Effect.Effect<string>;
  readonly newCommandSecret: Effect.Effect<CommandSecret>;
  readonly newCommandToken: Effect.Effect<Token>;
  readonly hashToken: (issued: Token) => Effect.Effect<TokenHash>;
  readonly newToken: Effect.Effect<Token>;
  readonly signature: (secret: CommandSecret, body: string) => Effect.Effect<string>;
}

const TOKEN_BYTES = 32;
const SECRET_BYTES = 32;
const CALL_ID_BYTES = 16;
const ATTACHMENT_ID_BYTES = 16;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function asAttachmentId(value: string): AttachmentId {
  return Option.getOrThrow(Option.liftPredicate(value, isAttachmentId));
}

function asCallId(value: string): CallId {
  return Option.getOrThrow(Option.liftPredicate(value, isCallId));
}

function newToken(): Token {
  return token(`cookout_${randomBytes(TOKEN_BYTES).toString("base64url")}`);
}

const USER_CODE_LETTERS = "BCDFGHJKLMNPQRSTVWXZ";
const USER_CODE_GROUP = 4;

function userCodeLetter(): string {
  return Option.getOrThrow(Str.charAt(randomInt(USER_CODE_LETTERS.length))(USER_CODE_LETTERS));
}

function userCodeGroup(): string {
  return Arr.join(Arr.makeBy(USER_CODE_GROUP, userCodeLetter), "");
}

function newUserCode(): string {
  return `${userCodeGroup()}-${userCodeGroup()}`;
}

function asCommandSecret(value: string): CommandSecret {
  return Option.getOrThrow(Option.liftPredicate(value, isCommandSecret));
}

const liveSecrets: LiveSecrets = {
  digest: (text) => Effect.sync(() => sha256(text)),
  hashToken: (issued) => Effect.sync(() => tokenHash(sha256(issued))),
  newAttachmentId: Effect.sync(() => asAttachmentId(randomBytes(ATTACHMENT_ID_BYTES).toString("hex"))),
  newCallId: Effect.sync(() => asCallId(`call_${randomBytes(CALL_ID_BYTES).toString("base64url")}`)),
  newCommandSecret: Effect.sync(() => asCommandSecret(`hmac_${randomBytes(SECRET_BYTES).toString("base64url")}`)),
  newCommandToken: Effect.sync(newToken),
  newToken: Effect.sync(newToken),
  newUserCode: Effect.sync(newUserCode),
  signature: (secret, body) => Effect.sync(() => createHmac("sha256", secret).update(body).digest("hex")),
};

export { liveSecrets };
