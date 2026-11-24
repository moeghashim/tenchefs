import type {
  AgentJoinApproval,
  AgentJoinCollection,
  AgentJoinRequest,
  StorageUnavailable,
} from "../../../storage/server.ts";
import type {
  AgentJoinCollectedResponse,
  AgentJoinRequestStartedResponse,
  AgentJoinRequestView,
  ApproveAgentJoinRequest,
} from "../../index.ts";
import { Effect, Function, Option } from "effect";
import type { Identity, IdentityName, Token } from "../../../identities/index.ts";
import {
  agentJoinRequestNotFound,
  lifetime,
  liveExpiryOf,
  liveRequest,
  lowered,
  now,
  termsAsked,
  viewOf,
} from "./join-request-terms.ts";
import { agentToApprove, agentToPreview } from "./resolve.ts";
import type { On } from "./join.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Terms } from "./join-request-terms.ts";
import { agentJoinApprovalPathOf } from "../../index.ts";
import { agentSessionLive } from "./refusals.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

interface StartAgentJoin {
  readonly as: IdentityName;
  readonly host: string;
  readonly idleExpiry?: string;
}

interface Approving {
  readonly caller: Identity;
  readonly userCode: string;
  readonly approval: ApproveAgentJoinRequest;
}

interface Viewing {
  readonly caller: Identity;
  readonly userCode: string;
}

interface JoinRequests {
  readonly startJoin: (request: StartAgentJoin) => Fails<AgentJoinRequestStartedResponse>;
  readonly collectJoin: (requestId: Token) => Fails<AgentJoinCollectedResponse>;
  readonly showJoin: (viewing: Viewing) => Fails<AgentJoinRequestView>;
  readonly approveJoin: (approving: Approving) => Fails<AgentJoinRequestView>;
}

const codeTaken = new Error("The new user code was taken: start again.");

function starter(on: On): JoinRequests["startJoin"] {
  const asked = termsAsked(on);
  return ({ as: agent, ...request }) =>
    Effect.gen(function* startAgentJoinRequest() {
      yield* asked(request.idleExpiry);
      const requestId = yield* on.secrets.newToken;
      const requestHash = yield* on.secrets.hashToken(requestId);
      const userCode = yield* on.secrets.newUserCode;
      const { createdAt, expiresAt } = yield* lifetime;
      const added = on.storage.addAgentJoinRequest(
        { ...request, agent, createdAt, expiresAt, requestHash, userCode },
        createdAt,
      );
      yield* Effect.filterOrElse(added, (result) => result === "added", Function.constant(Effect.die(codeTaken)));
      return { approvalPath: agentJoinApprovalPathOf(userCode), expiresAt, requestId, userCode };
    });
}

function collectionAnswer(
  collection: AgentJoinCollection,
  agentSessionToken: Token,
): Fails<AgentJoinCollectedResponse> {
  if (collection.status === "pending") {
    return Effect.succeed({ status: "pending" });
  }
  if (collection.status === "gone") {
    return Effect.fail(agentJoinRequestNotFound);
  }
  if (collection.status === "live") {
    return Effect.fail(agentSessionLive(collection));
  }
  const { created, expiresAt, identity, issuedAt } = collection;
  const agentSession = { agentSessionToken, created, expiresAt, identity, issuedAt };
  return Effect.succeed({ agentSession, status: "approved" });
}

function announcedCollection(on: On, answer: AgentJoinCollectedResponse): Fails<AgentJoinCollectedResponse> {
  if (answer.status === "approved") {
    return Effect.as(on.publishSession(answer.agentSession.identity), answer);
  }
  return Effect.succeed(answer);
}

function collector(on: On): JoinRequests["collectJoin"] {
  const { secrets, storage } = on;
  return (requestId) =>
    Effect.gen(function* collectAgentJoinRequest() {
      const requestHash = yield* secrets.hashToken(requestId);
      const agentSessionToken = yield* secrets.newToken;
      const sessionHash = yield* secrets.hashToken(agentSessionToken);
      const at = yield* now;
      const collection = yield* storage.collectAgentJoinRequest({ now: at, requestHash, sessionHash });
      const answer = yield* collectionAnswer(collection, agentSessionToken);
      return yield* announcedCollection(on, answer);
    });
}

function shower(on: On): JoinRequests["showJoin"] {
  const asked = termsAsked(on);
  return ({ caller, userCode }) =>
    Effect.gen(function* showAgentJoinRequest() {
      const found = yield* liveRequest(on)(userCode);
      const { idleExpiry } = yield* asked(found.idleExpiry);
      const { created, identity } = yield* agentToPreview({ as: found.agent, caller, on });
      const live = yield* liveExpiryOf(on)(identity.name);
      return viewOf({ creates: created, found, idleExpiry, joins: identity.name, live });
    });
}

function refuseLive(on: On, identity: IdentityName): Fails<void> {
  return Effect.flatMap(liveExpiryOf(on)(identity), (live) =>
    Option.match(live, {
      onNone: () => Effect.void,
      onSome: (expiresAt) => Effect.fail(agentSessionLive({ expiresAt, identity })),
    }),
  );
}

interface Decided {
  readonly approval: AgentJoinApproval;
  readonly terms: Terms;
}

function decided(on: On, { approval, caller }: Approving, found: AgentJoinRequest): Fails<Decided> {
  const asked = termsAsked(on);
  return Effect.gen(function* decideApproval() {
    const requested = yield* asked(found.idleExpiry);
    const terms = yield* lowered(requested)(approval.idleExpiry);
    const force = approval.force === true;
    const { created, identity } = yield* agentToApprove({ as: found.agent, caller, on });
    if (!force) {
      yield* refuseLive(on, identity.name);
    }
    return { approval: { created, force, identity: identity.name, idleSeconds: terms.idleSeconds }, terms };
  });
}

function approver(on: On): JoinRequests["approveJoin"] {
  return (approving) =>
    Effect.gen(function* approveAgentJoinRequest() {
      const found = yield* liveRequest(on)(approving.userCode);
      const { approval, terms } = yield* decided(on, approving, found);
      const at = yield* now;
      yield* on.storage.approveAgentJoinRequest(approving.userCode, approval, at);
      const { created: creates, identity: joins } = approval;
      const shown = { ...found, approved: true };
      return viewOf({ creates, found: shown, idleExpiry: terms.idleExpiry, joins, live: Option.none() });
    });
}

function joinRequestsOn(on: On): JoinRequests {
  return { approveJoin: approver(on), collectJoin: collector(on), showJoin: shower(on), startJoin: starter(on) };
}

export { type JoinRequests, joinRequestsOn };
