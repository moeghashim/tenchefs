/**
 * The one source of randomness and hashing: bearer tokens, what the store
 * keeps instead of a token, command secrets, command tokens, call
 * IDs, inbox message IDs, attachment IDs and the signature of a webhook delivery. The live Layer uses `node:crypto`;
 * tests count instead, with the Layer `testing` builds over this one.
 */
import type { CallId, WebhookCommandSecret } from "../webhook-commands/index.ts";
import { Context, Layer } from "effect";
import type { Token, TokenHash } from "../identities/index.ts";
import type { AttachmentId } from "../attachments/index.ts";
import type { AvatarId } from "../avatars/index.ts";
import type { Effect } from "effect";
import { liveSecrets } from "./lib/server/live.ts";

/**
 * The cipher for the secrets the server must send on, kept encrypted at rest (ADR 0150): trigger tokens, trigger
 * header values and Webhook command secrets. `secretsCipher` makes one from `COOKOUT_SECRETS_KEY`; `isSecretsKey`
 * says whether a value can be that key, and `newSecretsKey` makes one.
 */
export { type SecretsCipher, isSecretsKey, newSecretsKey, secretsCipher } from "./lib/server/cipher.ts";

export interface SecretsService {
  /** A new bearer token: `cookout_` and at least 256 random bits. */
  readonly newToken: Effect.Effect<Token>;
  /** What the store keeps instead of the token. The same token always hashes the same. */
  readonly hashToken: (token: Token) => Effect.Effect<TokenHash>;
  /** A new command secret, for signing webhook deliveries: `hmac_` and 256 random bits. */
  readonly newWebhookCommandSecret: Effect.Effect<WebhookCommandSecret>;
  /**
   * The command token sent with one command call's webhook delivery. Every command token is issued here, so the
   * server can later record it and let it post as the command's handler identity.
   */
  readonly newWebhookCommandToken: Effect.Effect<Token>;
  /** A new login request's user code: two groups of four letters a person can read aloud, such as `WDJB-MJHT`. */
  readonly newUserCode: Effect.Effect<string>;
  /** A new attachment ID: 128 random bits as base64url, so it gives nothing away. */
  readonly newAttachmentId: Effect.Effect<AttachmentId>;
  /** A new avatar ID: 128 random bits as hex, like an attachment's, so the two never clash in the asset store. */
  readonly newAvatarId: Effect.Effect<AvatarId>;
  /** A new call ID: `call_` and 128 random bits. */
  readonly newCallId: Effect.Effect<CallId>;
  /** A new ID for a message the runner posts into a Claude Code session's inbox socket: a random UUID. */
  readonly newInboxMessageId: Effect.Effect<string>;
  /**
   * The signature of a webhook delivery: the HMAC-SHA256 of `body` keyed with the command secret's UTF-8 bytes,
   * as 64 lowercase hex characters.
   */
  readonly signature: (secret: WebhookCommandSecret, body: string) => Effect.Effect<string>;
  /** The SHA-256 of `text`, as hex: a file name that doesn't give away what it was made from. */
  readonly digest: (text: string) => Effect.Effect<string>;
}

export class Secrets extends Context.Service<Secrets, SecretsService>()("@ai-hero/cookout/secrets/server/Secrets") {}

/** Secrets from `node:crypto`, for the running cookout. */
export const secretsLive: Layer.Layer<Secrets> = Layer.succeed(Secrets, liveSecrets);
