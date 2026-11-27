import type { CallId, WebhookCommandSecret } from "../../../webhook-commands/index.ts";
import { Effect, Layer, Option, Ref, String as Str } from "effect";
import { Secrets, secretsLive } from "../../../secrets/server.ts";
import { isCallId, isWebhookCommandSecret } from "../../../webhook-commands/index.ts";
import { token, tokenHash } from "../../../identities/index.ts";
import type { SecretsService } from "../../../secrets/server.ts";
import type { Token } from "../../../identities/index.ts";

type SecretsKind = "live" | "test";

const NONE_YET = 0;
const STEP = 1;
const USER_CODE_DIGITS = 4;

function callId(value: string): CallId {
  return Option.getOrThrow(Option.liftPredicate(value, isCallId));
}

function webhookCommandSecret(value: string): WebhookCommandSecret {
  return Option.getOrThrow(Option.liftPredicate(value, isWebhookCommandSecret));
}

function countingSecrets(live: SecretsService): Effect.Effect<SecretsService> {
  return Effect.gen(function* makeCountingSecrets() {
    const counter = yield* Ref.make(NONE_YET);
    function next(prefix: string): Effect.Effect<string> {
      return Effect.map(
        Ref.updateAndGet(counter, (count) => count + STEP),
        (count) => `${prefix}${String(count)}`,
      );
    }
    return {
      digest: live.digest,
      hashToken: (issued: Token) => Effect.succeed(tokenHash(`hash:${issued}`)),
      newAttachmentId: live.newAttachmentId,
      newAvatarId: live.newAvatarId,
      newCallId: Effect.map(next("call_test_"), callId),
      newInboxMessageId: live.newInboxMessageId,
      newToken: Effect.map(next("cookout_test_"), token),
      newUserCode: Effect.map(next(""), (count) => `TEST-${Str.padStart(USER_CODE_DIGITS, "0")(count)}`),
      newWebhookCommandSecret: Effect.map(next("hmac_test_"), webhookCommandSecret),
      newWebhookCommandToken: Effect.map(next("cookout_test_"), token),
      signature: live.signature,
    };
  });
}

const secretsTest: Layer.Layer<Secrets> = Layer.effect(Secrets, Effect.flatMap(Secrets, countingSecrets)).pipe(
  Layer.provide(secretsLive),
);

function secretsOf(kind: SecretsKind): Layer.Layer<Secrets> {
  if (kind === "live") {
    return secretsLive;
  }
  return secretsTest;
}

export { callId, secretsOf, secretsTest };
