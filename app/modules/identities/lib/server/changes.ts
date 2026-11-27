import { Array as Arr, Context, Effect, Layer, PubSub, Ref } from "effect";
import type { Identity, IdentityName, TokenHash } from "../../index.ts";
import type { EndedCredential } from "../../../storage/server.ts";
import type { Scope } from "effect";

type EndedTokens =
  | { readonly kind: "agent session"; readonly hash: TokenHash }
  | { readonly kind: "agent sessions" }
  | { readonly kind: "identity tokens"; readonly loginCredentials: readonly TokenHash[] }
  | { readonly kind: "credentials"; readonly hashes: readonly TokenHash[] }
  | { readonly kind: "all" };

interface TokensEnded {
  readonly identity: IdentityName;
  readonly tokens: EndedTokens;
  readonly cause: "left" | "revoked" | "rotated" | "deactivated" | "session revoked";
  readonly by: IdentityName | typeof THE_COOKOUT;
}

type TokensEndedHandler = (ended: TokensEnded) => Effect.Effect<void>;

type ReactivatedHandler = (identity: Identity) => Effect.Effect<void>;

const THE_COOKOUT = "the cookout";

interface IdentityChangesService {
  readonly publish: (identity: Identity) => Effect.Effect<void>;
  readonly changed: Effect.Effect<PubSub.Subscription<Identity>, never, Scope.Scope>;
  readonly publishDeleted: (identity: Identity) => Effect.Effect<void>;
  readonly deleted: Effect.Effect<PubSub.Subscription<Identity>, never, Scope.Scope>;
  readonly endTokens: (ended: TokensEnded) => Effect.Effect<void>;
  readonly onTokensEnded: (handler: TokensEndedHandler) => Effect.Effect<void, never, Scope.Scope>;
  readonly reactivated: (identity: Identity) => Effect.Effect<void>;
  readonly onReactivated: (handler: ReactivatedHandler) => Effect.Effect<void, never, Scope.Scope>;
}

class IdentityChanges extends Context.Service<IdentityChanges, IdentityChangesService>()(
  "@ai-hero/cookout/identities/lib/server/changes/IdentityChanges",
) {}

const EACH_IN_TURN = { concurrency: 1, discard: true } as const;

const identityChangesLayer: Layer.Layer<IdentityChanges> = Layer.effect(
  IdentityChanges,
  Effect.gen(function* identityChangesHub() {
    const changedHub = yield* PubSub.unbounded<Identity>();
    const deletedHub = yield* PubSub.unbounded<Identity>();
    const handlers = yield* Ref.make<ReadonlySet<TokensEndedHandler>>(new Set());
    const onReactivation = yield* Ref.make<ReadonlySet<ReactivatedHandler>>(new Set());
    return {
      changed: PubSub.subscribe(changedHub),
      deleted: PubSub.subscribe(deletedHub),
      endTokens: (ended) =>
        Effect.flatMap(Ref.get(handlers), (held) =>
          Effect.forEach([...held], (handler) => handler(ended), EACH_IN_TURN),
        ),
      onReactivated: (handler) =>
        Effect.acquireRelease(
          Ref.update(onReactivation, (held) => new Set([...held, handler])),
          () => Ref.update(onReactivation, (held) => new Set(Arr.filter([...held], (each) => each !== handler))),
        ),
      onTokensEnded: (handler) =>
        Effect.acquireRelease(
          Ref.update(handlers, (held) => new Set([...held, handler])),
          () => Ref.update(handlers, (held) => new Set(Arr.filter([...held], (each) => each !== handler))),
        ),
      publish: (identity: Identity) => Effect.asVoid(PubSub.publish(changedHub, identity)),
      publishDeleted: (identity: Identity) => Effect.asVoid(PubSub.publish(deletedHub, identity)),
      reactivated: (identity) =>
        Effect.flatMap(Ref.get(onReactivation), (held) =>
          Effect.forEach([...held], (handler) => handler(identity), EACH_IN_TURN),
        ),
    };
  }),
);

function announced(identity: Identity): Effect.Effect<Identity, never, IdentityChanges> {
  return Effect.flatMap(IdentityChanges, (changes) => Effect.as(changes.publish(identity), identity));
}

function announcedDeleted(identity: Identity): Effect.Effect<Identity, never, IdentityChanges> {
  return Effect.flatMap(IdentityChanges, (changes) => Effect.as(changes.publishDeleted(identity), identity));
}

function reactivated(identity: Identity): Effect.Effect<Identity, never, IdentityChanges> {
  return Effect.flatMap(IdentityChanges, (changes) => Effect.as(changes.reactivated(identity), identity));
}

function tokensEnded(ended: TokensEnded): Effect.Effect<void, never, IdentityChanges> {
  return Effect.flatMap(IdentityChanges, (changes) => changes.endTokens(ended));
}

interface CredentialsEnded {
  readonly ended: readonly EndedCredential[];
  readonly by: TokensEnded["by"];
}

type Streamed = Exclude<EndedCredential["kind"], "join code" | "login link">;

const CAUSE_OF: Readonly<Record<Streamed, TokensEnded["cause"]>> = {
  "agent session": "revoked",
  session: "session revoked",
};

function sameHolder(one: EndedCredential, other: EndedCredential): boolean {
  return one.identity === other.identity && one.kind === other.kind;
}

function isStreamed(credential: EndedCredential): credential is EndedCredential & { readonly kind: Streamed } {
  return credential.kind !== "join code" && credential.kind !== "login link";
}

function endingsOf({ by, ended }: CredentialsEnded): readonly TokensEnded[] {
  const streamed = Arr.filter(ended, isStreamed);
  return Arr.map(Arr.dedupeWith(streamed, sameHolder), (holder): TokensEnded => {
    const hashes = Arr.map(
      Arr.filter(streamed, (each) => sameHolder(each, holder)),
      ({ hash }) => hash,
    );
    return { by, cause: CAUSE_OF[holder.kind], identity: holder.identity, tokens: { hashes, kind: "credentials" } };
  });
}

function credentialsEnded(revoke: CredentialsEnded): Effect.Effect<void, never, IdentityChanges> {
  return Effect.forEach(endingsOf(revoke), tokensEnded, EACH_IN_TURN);
}

export {
  type EndedTokens,
  IdentityChanges,
  THE_COOKOUT,
  type TokensEnded,
  announced,
  announcedDeleted,
  credentialsEnded,
  endingsOf,
  identityChangesLayer,
  reactivated,
  tokensEnded,
};
