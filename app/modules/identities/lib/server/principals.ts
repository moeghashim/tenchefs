import { DateTime, Effect, Function, Option, Predicate } from "effect";
import type { Identity, TokenHash } from "../../index.ts";
import type { Storage, StorageUnavailable, WebhookCommandTokenGrant } from "../../../storage/server.ts";
import type { MessageId } from "../../../messages/index.ts";
import type { Refusal } from "../../../http/index.ts";

const tokenUnknown: Refusal = {
  code: "token_unknown",
  message: "This token is not known to this cookout.",
  status: 401,
};

const tokenExpired: Refusal = {
  code: "token_expired",
  message: "This command token expired 24 h after its call.",
  status: 401,
};

interface Principal {
  readonly identity: Identity;
  readonly webhookCommandThread: Option.Option<MessageId>;
  readonly agentSession: Option.Option<TokenHash>;
  readonly loginCredential: Option.Option<TokenHash>;
}

function grantPrincipal(grant: WebhookCommandTokenGrant): Effect.Effect<Principal, Refusal> {
  return Effect.gen(function* checkWebhookCommandToken() {
    const now = yield* DateTime.now;
    if (DateTime.isGreaterThanOrEqualTo(now, DateTime.makeUnsafe(grant.expiresAt))) {
      return yield* Effect.fail(tokenExpired);
    }
    return {
      agentSession: Option.none(),
      identity: grant.handler,
      loginCredential: Option.none(),
      webhookCommandThread: Option.some(grant.threadId),
    };
  });
}

interface LoginLookup {
  readonly hash: TokenHash;
  readonly storage: Storage["Service"];
}

function webhookCommandTokenPrincipal({ hash, storage }: LoginLookup) {
  return (grant: WebhookCommandTokenGrant | undefined): Effect.Effect<Principal, Refusal | StorageUnavailable> => {
    if (Predicate.isUndefined(grant)) {
      return storage.findLoginCredential(hash).pipe(
        Effect.filterOrFail(Predicate.isNotUndefined, Function.constant(tokenUnknown)),
        Effect.map((identity) => ({
          agentSession: Option.none(),
          identity,
          loginCredential: Option.some(hash),
          webhookCommandThread: Option.none(),
        })),
      );
    }
    return grantPrincipal(grant);
  };
}

export { type Principal, webhookCommandTokenPrincipal };
