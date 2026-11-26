import type { AgentIdentity, Identity, IdentityName, Token } from "../../../identities/index.ts";
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
  DenyAgentJoinResponse,
} from "../../index.ts";
import { Effect, Function, Option, Predicate } from "effect";
import type { Lifetime, Terms } from "./join-request-terms.ts";
import {
  agentJoinRequestDenied,
  agentJoinRequestNotFound,
  lifetime,
  liveExpiryOf,
  liveRequest,
  lowered,
  now,
  peopleShownJoinRequestAt,
  termsAsked,
  viewOf,
} from "./join-request-terms.ts";
import { agentNotFound, agentSessionLive, joinNotOwned } from "./refusals.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { On } from "./join.ts";
import type { Refusal } from "../../../http/index.ts";
import { agentJoinApprovalPathOf } from "../../index.ts";
import { agentToApprove } from "./resolve.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

interface StartAgentJoin {
  readonly as: IdentityName;
  readonly host: string;
  readonly idleExpiry?: string;
  readonly sessionUrl?: string;
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

interface JoinRequestChange {
  readonly agent: IdentityName;
  readonly reaches: "everyone" | "people";
}

interface StartedJoinRequest {
  readonly agent: IdentityName;
  readonly createdAt: IsoTime;
  readonly shownToPeopleAt: IsoTime;
  readonly expiresAt: IsoTime;
}

interface JoinRequestChanges {
  readonly started: (started: StartedJoinRequest) => Effect.Effect<void>;
  readonly approved: (agent: IdentityName) => Effect.Effect<void>;
  readonly denied: (agent: IdentityName) => Effect.Effect<void>;
}

interface JoinRequests {
  readonly startJoin: (request: StartAgentJoin) => Fails<AgentJoinRequestStartedResponse>;
  readonly collectJoin: (requestId: Token) => Fails<AgentJoinCollectedResponse>;
  readonly showJoin: (viewing: Viewing) => Fails<AgentJoinRequestView>;
  readonly approveJoin: (approving: Approving) => Fails<AgentJoinRequestView>;
  readonly denyJoin: (viewing: Viewing) => Fails<DenyAgentJoinResponse>;
}

interface Changing extends On {
  readonly joinRequestChanges: JoinRequestChanges;
}

const codeTaken = new Error("The new user code was taken: start again.");

function isActiveAgent(found: Identity | undefined): found is AgentIdentity {
  return Predicate.isNotUndefined(found) && found.kind === "agent" && found.deactivated !== true;
}

function refuseUnlessAgent(on: On, agent: IdentityName): Fails<AgentIdentity> {
  return Effect.filterOrFail(on.storage.findIdentityByName(agent), isActiveAgent, () => agentNotFound(agent));
}

function startedOf(agent: AgentIdentity, { createdAt, expiresAt }: Lifetime): StartedJoinRequest {
  const shownToPeopleAt = peopleShownJoinRequestAt({ agent, createdAt });
  return { agent: agent.name, createdAt, expiresAt, shownToPeopleAt };
}

function starter(on: Changing): JoinRequests["startJoin"] {
  const asked = termsAsked(on);
  return ({ as: agent, ...request }) =>
    Effect.gen(function* startAgentJoinRequest() {
      yield* asked(request.idleExpiry);
      const identity = yield* refuseUnlessAgent(on, agent);
      const requestId = yield* on.secrets.newToken;
      const requestHash = yield* on.secrets.hashToken(requestId);
      const userCode = yield* on.secrets.newUserCode;
      const { createdAt, expiresAt } = yield* lifetime;
      const added = on.storage.addAgentJoinRequest(
        { ...request, agent, createdAt, expiresAt, requestHash, userCode },
        createdAt,
      );
      const stored = Effect.filterOrElse(
        added,
        (result) => result === "added",
        Function.constant(Effect.die(codeTaken)),
      );
      yield* Effect.andThen(stored, on.joinRequestChanges.started(startedOf(identity, { createdAt, expiresAt })));
      return { approvalPath: agentJoinApprovalPathOf(userCode), expiresAt, requestId, userCode };
    });
}

function approvedAnswer(
  collected: Extract<AgentJoinCollection, { readonly status: "collected" }>,
  agentSessionToken: Token,
): AgentJoinCollectedResponse {
  const { created, expiresAt, identity, issuedAt, sessionUrl } = collected;
  const agentSession = { agentSessionToken, created, expiresAt, identity, issuedAt };
  if (Predicate.isUndefined(sessionUrl)) {
    return { agentSession, status: "approved" };
  }
  return { agentSession: { ...agentSession, sessionUrl }, status: "approved" };
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
  if (collection.status === "denied") {
    return Effect.fail(agentJoinRequestDenied);
  }
  if (collection.status === "live") {
    return Effect.fail(agentSessionLive(collection));
  }
  return Effect.succeed(approvedAnswer(collection, agentSessionToken));
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
      const { created, identity } = yield* agentToApprove({ as: found.agent, caller, on });
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

function approver(on: Changing): JoinRequests["approveJoin"] {
  return (approving) =>
    Effect.gen(function* approveAgentJoinRequest() {
      const found = yield* liveRequest(on)(approving.userCode);
      const { approval, terms } = yield* decided(on, approving, found);
      const at = yield* now;
      yield* on.storage.approveAgentJoinRequest(approving.userCode, approval, at);
      yield* on.joinRequestChanges.approved(found.agent);
      const { created: creates, identity: joins } = approval;
      const shown = { ...found, approved: true };
      return viewOf({ creates, found: shown, idleExpiry: terms.idleExpiry, joins, live: Option.none() });
    });
}

function denier(on: Changing): JoinRequests["denyJoin"] {
  return ({ caller, userCode }) =>
    Effect.gen(function* denyAgentJoinRequest() {
      const found = yield* liveRequest(on)(userCode);
      const { identity } = yield* agentToApprove({ as: found.agent, caller, on });
      if (identity.name !== found.agent) {
        return yield* Effect.fail(joinNotOwned(found.agent));
      }
      const at = yield* now;
      const denied = yield* on.storage.denyAgentJoinRequest(userCode, at);
      if (denied === "not_found") {
        return yield* Effect.fail(agentJoinRequestNotFound);
      }
      yield* on.joinRequestChanges.denied(found.agent);
      return { denied: true, userCode };
    });
}

function joinRequestsOn(on: Changing): JoinRequests {
  return {
    approveJoin: approver(on),
    collectJoin: collector(on),
    denyJoin: denier(on),
    showJoin: shower(on),
    startJoin: starter(on),
  };
}

export { type JoinRequestChange, type JoinRequestChanges, type JoinRequests, type StartedJoinRequest, joinRequestsOn };
