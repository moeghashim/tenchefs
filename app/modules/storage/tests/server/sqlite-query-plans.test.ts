import { Array as Arr, DateTime, Effect, String as Str } from "effect";
import type { QueryPlan, Storage, StorageUnavailable } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import { freshSqliteQueryPlans, identityFixture, isoTime } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import type { TokenHash } from "../../../identities/index.ts";
import { tokenHash } from "../../../identities/index.ts";

interface Session {
  readonly expiresAt: ReturnType<typeof isoTime>;
  readonly hash: TokenHash;
  readonly identity: typeof agent.name;
  readonly idleSeconds: number;
  readonly issuedAt: ReturnType<typeof isoTime>;
}

const HASH_LENGTH = 64;
const IDLE_SECONDS = 60;
const NONE = 0;
const T0 = isoTime("2026-01-01T00:00:00.000Z");
const T30 = isoTime("2026-01-01T00:00:30.000Z");
const agent = identityFixture("agent", { kind: "agent" });
const TOKEN_TABLES = /\b(?:tokens|agent_session_tokens)\b/v;
const FILTERS_ON_REVOKED = /WHERE[^;]*revoked/v;

function hashOf(character: string): TokenHash {
  return tokenHash(Str.repeat(HASH_LENGTH)(character));
}

function session(hash: TokenHash): Session {
  const expiry = DateTime.add(DateTime.makeUnsafe(T0), { seconds: IDLE_SECONDS });
  const expiresAt = isoTime(DateTime.formatIso(expiry));
  return { expiresAt, hash, identity: agent.name, idleSeconds: IDLE_SECONDS, issuedAt: T0 };
}

function revokeAndLookUpTokens(storage: Storage["Service"]): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* everything() {
    yield* storage.createIdentity(agent, hashOf("a"));
    yield* storage.replaceToken(agent.name, hashOf("b"));
    yield* storage.setOnlyToken(agent, hashOf("c"));
    yield* storage.findIdentityByTokenHash(hashOf("c"));
    yield* storage.issueAgentSession({ force: false, session: session(hashOf("1")) });
    yield* storage.findLiveAgentSession({ identity: agent.name, now: T30 });
    yield* storage.issueAgentSession({ force: true, session: session(hashOf("2")) });
    yield* storage.revokeLiveAgentSession({ identity: agent.name, now: T30 });
    yield* storage.deactivateIdentity(agent.name);
    yield* storage.reactivateIdentity(agent.name, hashOf("d"));
  });
}

function filtersOnRevoked({ sql }: QueryPlan): boolean {
  return FILTERS_ON_REVOKED.test(sql) && TOKEN_TABLES.test(sql);
}

function scansATokenTable({ plan }: QueryPlan): boolean {
  return Arr.some(plan, (detail) => Str.startsWith("SCAN ")(detail) && TOKEN_TABLES.test(detail));
}

it.effect("on SQLite, every token and agent session lookup and revoke that filters on revoked uses an index", () =>
  Effect.gen(function* plans() {
    const planned = yield* freshSqliteQueryPlans(revokeAndLookUpTokens);
    const filtering = Arr.filter(planned, filtersOnRevoked);

    expect(filtering.length).toBeGreaterThan(NONE);
    expect(Arr.filter(filtering, scansATokenTable)).toStrictEqual([]);
  }).pipe(Effect.provide(NodeServices.layer)),
);
