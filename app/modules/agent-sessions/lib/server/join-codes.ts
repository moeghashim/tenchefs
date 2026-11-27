import type { AgentIdentity, DisplayName, HumanIdentity, IdentityName } from "../../../identities/index.ts";
import { DateTime, Effect, Predicate } from "effect";
import type { JoinCodeRedemption, StorageUnavailable } from "../../../storage/server.ts";
import type { JoinCodeResponse, RedeemJoinCodeRequest, RedeemJoinCodeResponse } from "../../join-codes.ts";
import { agentSessionLive, identityDeactivated, withParent } from "./refusals.ts";
import type { Description } from "../../../identities/client.ts";
import type { On } from "./join.ts";
import type { Refusal } from "../../../http/index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { joinCodeLifetimeMinutes } from "../../join-codes.ts";
import { termsAsked } from "./join-request-terms.ts";
import { token } from "../../../identities/index.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

interface NewAgent {
  readonly caller: HumanIdentity;
  readonly name: IdentityName;
  readonly description?: Description;
  readonly displayName?: DisplayName;
}

interface JoinCodes {
  readonly createJoinCode: (agent: NewAgent) => Fails<JoinCodeResponse>;
  readonly redeemJoinCode: (request: RedeemJoinCodeRequest) => Fails<RedeemJoinCodeResponse>;
}

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;

const joinCodeNotFound: Refusal = {
  code: "join_code_not_found",
  message:
    "This join code was used, expired, or never issued: each one joins once, within " +
    `${joinCodeLifetimeMinutes} minutes of being made. Ask the agent's owner for a new one.`,
  status: NOT_FOUND,
};

function displayNameRequired(name: IdentityName): Refusal {
  return {
    code: "display_name_required",
    message: `${name} would be a new agent, and a new agent needs a display name: send displayName.`,
    status: BAD_REQUEST,
  };
}

function createRefusal(result: "name_taken" | "name_not_owned" | "owner_not_human", name: IdentityName): Refusal {
  if (result === "name_taken") {
    return { code: "identity_exists", message: `The name ${name} is taken.`, status: CONFLICT };
  }
  return {
    code: "name_not_owned",
    message: `${name} is namespaced: only an agent owned by the human named before its '/' can have it.`,
    status: BAD_REQUEST,
  };
}

type JoinedFrom = Pick<RedeemJoinCodeRequest, "host" | "sessionUrl">;

function withSessionUrl<Fields extends object>(
  fields: Fields,
  sessionUrl: string | undefined,
): Fields & Pick<JoinedFrom, "sessionUrl"> {
  if (Predicate.isUndefined(sessionUrl)) {
    return fields;
  }
  return { ...fields, sessionUrl };
}

function withJoinedFrom<Redeem extends object>(redeem: Redeem, { host, sessionUrl }: JoinedFrom): Redeem & JoinedFrom {
  if (Predicate.isUndefined(host)) {
    return withSessionUrl(redeem, sessionUrl);
  }
  return withSessionUrl({ ...redeem, host }, sessionUrl);
}

function newAgentOf(asked: NewAgent, createdAt: AgentIdentity["createdAt"]): Effect.Effect<AgentIdentity, Refusal> {
  const { caller, description, displayName, name } = asked;
  if (Predicate.isUndefined(displayName)) {
    return Effect.fail(displayNameRequired(name));
  }
  const agent: AgentIdentity = { admin: false, createdAt, displayName, kind: "agent", name, owner: caller.name };
  if (Predicate.isUndefined(description)) {
    return Effect.succeed(agent);
  }
  return Effect.succeed({ ...agent, description });
}

function agentCreator({ publishIdentity, secrets, storage }: On) {
  return (agent: AgentIdentity): Fails<void> =>
    Effect.gen(function* createOwnedAgent() {
      const identityHash = yield* Effect.flatMap(secrets.newToken, secrets.hashToken);
      const created = yield* storage.createIdentity(agent, identityHash);
      if (created !== "created") {
        return yield* Effect.fail(createRefusal(created, agent.name));
      }
      if (Predicate.isNotUndefined(agent.description)) {
        yield* storage.setDescription(agent.name, agent.description);
      }
      return yield* publishIdentity(agent);
    });
}

function creator(on: On): JoinCodes["createJoinCode"] {
  const { secrets, storage } = on;
  const createAgent = agentCreator(on);
  return (asked) =>
    Effect.gen(function* createAgentWithJoinCode() {
      const now = yield* DateTime.now;
      const createdAt = isoTimeOf(now);
      const agent = yield* newAgentOf(asked, createdAt);
      yield* createAgent(agent);
      const joinCode = yield* secrets.newToken;
      const codeHash = yield* secrets.hashToken(joinCode);
      const expiresAt = isoTimeOf(DateTime.add(now, { minutes: joinCodeLifetimeMinutes }));
      yield* Effect.flatMap(withParent({ agent: agent.name, codeHash, createdAt, expiresAt }), storage.addJoinCode);
      return { expiresAt, identity: agent, joinCode };
    });
}

function answerOf(
  redemption: JoinCodeRedemption,
  agentSessionToken: RedeemJoinCodeResponse["agentSessionToken"],
): Effect.Effect<RedeemJoinCodeResponse, Refusal> {
  if (redemption.status === "gone") {
    return Effect.fail(joinCodeNotFound);
  }
  if (redemption.status === "deactivated") {
    return Effect.fail(identityDeactivated(redemption.identity));
  }
  if (redemption.status === "live") {
    return Effect.fail(agentSessionLive(redemption));
  }
  const { expiresAt, identity, issuedAt, sessionUrl } = redemption;
  return Effect.succeed(
    withSessionUrl({ agentSessionToken, created: false, expiresAt, identity, issuedAt }, sessionUrl),
  );
}

function redeemer(on: On): JoinCodes["redeemJoinCode"] {
  const asked = termsAsked(on);
  const { publishSession, secrets, storage } = on;
  return ({ idleExpiry, joinCode, ...joinedFrom }) =>
    Effect.gen(function* redeemJoinCode() {
      const { idleSeconds } = yield* asked(idleExpiry);
      const codeHash = yield* secrets.hashToken(token(joinCode));
      const agentSessionToken = yield* secrets.newToken;
      const sessionHash = yield* secrets.hashToken(agentSessionToken);
      const now = yield* Effect.map(DateTime.now, isoTimeOf);
      const redemption = yield* storage.redeemJoinCode(
        withJoinedFrom({ codeHash, idleSeconds, now, sessionHash }, joinedFrom),
      );
      const answer = yield* answerOf(redemption, agentSessionToken);
      return yield* Effect.as(publishSession(answer.identity), answer);
    });
}

function joinCodesOn(on: On): JoinCodes {
  return { createJoinCode: creator(on), redeemJoinCode: redeemer(on) };
}

export { type JoinCodes, joinCodesOn };
