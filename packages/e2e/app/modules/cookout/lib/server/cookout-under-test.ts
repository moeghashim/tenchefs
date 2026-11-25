import { Array as Arr, Context, Effect, Layer, Random, Redacted, String as Str } from "effect";
import type { BinNeeds, BinResult, BinRun } from "./bin.ts";
import type { ChannelResponse, CookoutClient, Identity, IdentityWithTokenResponse } from "@ai-hero/cookout/sdk";
import { e2eAdminToken, e2eUrl } from "../../../config/server.ts";
import { e2eNameStart, requireRunIdentity, runPrefix, runPrefixSpace } from "./run-prefix.ts";
import type { Config } from "effect";
import type { JoinAgent } from "./session.ts";
import { createCookoutClient } from "@ai-hero/cookout/sdk";
import { joinAgentWith } from "./session.ts";
import { runBin } from "./bin.ts";

interface CookoutUnderTestService {
  readonly url: string;
  readonly prefix: string;
  readonly admin: CookoutClient;
  readonly owner: Effect.Effect<CookoutClient>;
  readonly createAgent: (name: string) => Effect.Effect<IdentityWithTokenResponse>;
  readonly createHuman: (name: string) => Effect.Effect<IdentityWithTokenResponse>;
  readonly createChannel: (name: string) => Effect.Effect<ChannelResponse>;
  readonly deactivateIdentity: (name: string) => Effect.Effect<void>;
  readonly runCookout: (run: BinRun) => Effect.Effect<BinResult, never, BinNeeds>;
  readonly joinAgent: JoinAgent;
}

const NO_DRAW = 0;
const REFUSED = "refused";
const ONE_AT_A_TIME = { concurrency: 1, discard: true } as const;

class CookoutUnderTest extends Context.Service<CookoutUnderTest, CookoutUnderTestService>()(
  "@ai-hero/cookout-e2e/cookout/lib/server/cookout-under-test/CookoutUnderTest",
) {}

function deactivateRunIdentity(admin: CookoutClient, prefix: string): (name: string) => Effect.Effect<void> {
  return (name) =>
    Effect.flatMap(requireRunIdentity(prefix)(name), (own) =>
      Effect.asVoid(Effect.promise(() => admin.deactivateIdentity(own))),
    );
}

function removeIdentity(admin: CookoutClient, prefix: string, identity: Identity): Effect.Effect<void> {
  const deleting = Effect.flatMap(requireRunIdentity(prefix)(identity.name), (own) =>
    Effect.tryPromise({ catch: () => REFUSED, try: () => admin.deleteIdentity(own) }),
  );
  if (identity.deactivated === true) {
    return Effect.ignore(deleting);
  }
  return Effect.matchEffect(deleting, {
    onFailure: () => deactivateRunIdentity(admin, prefix)(identity.name),
    onSuccess: () => Effect.void,
  });
}

function removeRunIdentities(admin: CookoutClient, prefix: string): Effect.Effect<void> {
  return Effect.gen(function* removeOwn() {
    const { identities } = yield* Effect.promise(() => admin.listIdentities({ include: "deactivated" }));
    const own = Arr.filter(identities, ({ name }) => Str.startsWith(`${prefix}-`)(name));
    const agents = Arr.filter(own, ({ kind }) => kind === "agent");
    const humans = Arr.filter(own, ({ kind }) => kind === "human");
    yield* Effect.forEach([...agents, ...humans], (identity) => removeIdentity(admin, prefix, identity), ONE_AT_A_TIME);
  });
}

function deleteChannelsStartingWith(admin: CookoutClient, start: string): Effect.Effect<void> {
  return Effect.gen(function* deleteChannels() {
    const { channels } = yield* Effect.promise(() => admin.listChannels());
    const own = Arr.filter(channels, ({ name }) => Str.startsWith(start)(name));
    yield* Effect.forEach(own, ({ name }) => Effect.promise(() => admin.deleteChannel(name)), ONE_AT_A_TIME);
  });
}

function createUnsubscribedChannel(admin: CookoutClient, name: string): Effect.Effect<ChannelResponse> {
  return Effect.gen(function* createChannel() {
    const created = yield* Effect.promise(() => admin.createChannel({ name }));
    yield* Effect.promise(() => admin.unsubscribe(name));
    return created;
  });
}

function humanCreator(
  admin: CookoutClient,
  prefix: string,
): (name: string) => Effect.Effect<IdentityWithTokenResponse> {
  return (name) => Effect.promise(() => admin.createIdentity({ kind: "human", name: `${prefix}-${name}` }));
}

interface AdminConnection {
  readonly admin: CookoutClient;
  readonly url: string;
}

const adminClient: Effect.Effect<AdminConnection, Config.ConfigError> = Effect.gen(function* connectAdmin() {
  const url = yield* e2eUrl;
  const adminToken = yield* e2eAdminToken;
  return { admin: createCookoutClient({ token: Redacted.value(adminToken), url }), url };
});

const deleteE2eChannels: Effect.Effect<void> = Effect.flatMap(adminClient, ({ admin }) =>
  deleteChannelsStartingWith(admin, e2eNameStart),
).pipe(Effect.orDie);

const cookoutUnderTest: Layer.Layer<CookoutUnderTest> = Layer.effect(
  CookoutUnderTest,
  Effect.gen(function* startRun() {
    const { admin, url } = yield* adminClient;
    const draw = yield* Random.nextIntBetween(NO_DRAW, runPrefixSpace);
    const prefix = runPrefix(draw);
    yield* Effect.addFinalizer(() =>
      Effect.andThen(deleteChannelsStartingWith(admin, `${prefix}-`), removeRunIdentities(admin, prefix)),
    );
    const createHuman = humanCreator(admin, prefix);
    const owner = yield* Effect.cached(createHuman("owner"));
    function createAgent(name: string): Effect.Effect<IdentityWithTokenResponse> {
      const agent = `${prefix}-${name}`;
      return Effect.flatMap(owner, ({ identity }) =>
        Effect.gen(function* createUnnamedAgent() {
          const asked = { displayName: agent, kind: "agent", name: agent, owner: identity.name } as const;
          const { token } = yield* Effect.promise(() => admin.createIdentity(asked));
          const cleared = yield* Effect.promise(() => admin.setDisplayName(agent, null));
          return { ...cleared, token };
        }),
      );
    }
    const runCookout = runBin(url);
    return {
      admin,
      createAgent,
      createChannel: (name: string) => createUnsubscribedChannel(admin, `${prefix}-${name}`),
      createHuman,
      deactivateIdentity: deactivateRunIdentity(admin, prefix),
      joinAgent: joinAgentWith({ createAgent, runCookout, url }),
      owner: Effect.map(owner, ({ token }) => createCookoutClient({ token, url })),
      prefix,
      runCookout,
      url,
    };
  }).pipe(Effect.orDie),
);

export { CookoutUnderTest, type CookoutUnderTestService, cookoutUnderTest, deleteE2eChannels };
