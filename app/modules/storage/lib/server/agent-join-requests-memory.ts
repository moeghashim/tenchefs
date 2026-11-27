import type {
  AgentJoinApproval,
  AgentJoinCollection,
  AgentJoinRequest,
  AgentJoinRequestsSection,
  CollectAgentJoinRequest,
  NewAgentJoinRequest,
  PendingAgentJoinRequest,
} from "./agent-join-requests.ts";
import { Array as Arr, Effect, Option, Order, pipe } from "effect";
import { DENIED, GONE, PENDING, collectionOf, originOf, sessionToIssue } from "./agent-join-requests.ts";
import type { AgentSessionsSection } from "./agent-sessions.ts";
import type { Fails } from "./errors.ts";
import type { FindIdentity } from "./identity-row.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { MemoryState } from "./memory-state.ts";
import type { TokenHash } from "../../../identities/index.ts";
import { memoryAgentSessions } from "./agent-sessions-memory.ts";
import { memoryJoinCodes } from "./join-codes-memory.ts";

interface Kept {
  readonly request: NewAgentJoinRequest;
  readonly approval: Option.Option<AgentJoinApproval>;
  readonly denied: boolean;
}

type Requests = Map<TokenHash, Kept>;

interface MemoryAgentJoinRequestsOptions {
  readonly state: MemoryState;
  readonly issueAgentSession: AgentSessionsSection["issueAgentSession"];
}

type Taken =
  | { readonly status: "pending" }
  | { readonly status: "gone" }
  | { readonly status: "denied" }
  | { readonly status: "approved"; readonly request: NewAgentJoinRequest; readonly approval: AgentJoinApproval };

function shown({ approval, request }: Kept): AgentJoinRequest {
  const { agent, clientIp, createdAt, expiresAt, host, idleExpiry, userAgent, userCode } = request;
  const origin = originOf({ clientIp, userAgent });
  const view = { ...origin, agent, approved: Option.isSome(approval), createdAt, expiresAt, host, userCode };
  return Option.match(Option.fromUndefinedOr(idleExpiry), {
    onNone: () => view,
    onSome: (asked) => ({ ...view, idleExpiry: asked }),
  });
}

function dropExpired(requests: Requests, now: IsoTime): void {
  for (const [hash, { request }] of requests) {
    if (now >= request.expiresAt) {
      requests.delete(hash);
    }
  }
}

const oldestFirst: Order.Order<NewAgentJoinRequest> = Order.combine(
  Order.mapInput(Order.String, (request: NewAgentJoinRequest) => request.createdAt),
  Order.mapInput(Order.String, (request: NewAgentJoinRequest) => request.userCode),
);

function pendingOf({ agent, createdAt, expiresAt, host, userCode }: NewAgentJoinRequest): PendingAgentJoinRequest {
  return { agent, createdAt, expiresAt, host, userCode };
}

function pendingIn(requests: Requests, now: IsoTime): readonly PendingAgentJoinRequest[] {
  dropExpired(requests, now);
  const unapproved = Arr.filter([...requests.values()], ({ approval, denied }) => Option.isNone(approval) && !denied);
  const sorted = Arr.sort(
    Arr.map(unapproved, ({ request }) => request),
    oldestFirst,
  );
  return Arr.map(sorted, pendingOf);
}

function liveByCode(requests: Requests, userCode: string, now: IsoTime): Option.Option<Kept> {
  dropExpired(requests, now);
  return Arr.findFirst([...requests.values()], ({ request }) => request.userCode === userCode);
}

function undeniedByCode(requests: Requests, userCode: string, now: IsoTime): Option.Option<Kept> {
  return Option.filter(liveByCode(requests, userCode, now), ({ denied }) => !denied);
}

function takeFrom(requests: Requests, { now, requestHash }: CollectAgentJoinRequest): Taken {
  dropExpired(requests, now);
  return Option.match(Option.fromUndefinedOr(requests.get(requestHash)), {
    onNone: (): Taken => ({ status: "gone" }),
    onSome: ({ approval, denied, request }): Taken => {
      if (denied) {
        return { status: "denied" };
      }
      if (Option.isNone(approval)) {
        return { status: "pending" };
      }
      requests.delete(requestHash);
      return { approval: approval.value, request, status: "approved" };
    },
  });
}

function collectFrom(requests: Requests, issueAgentSession: AgentSessionsSection["issueAgentSession"]) {
  return (collect: CollectAgentJoinRequest) =>
    (taken: Taken): Fails<AgentJoinCollection> => {
      if (taken.status === "pending") {
        return Effect.succeed(PENDING);
      }
      if (taken.status === "gone") {
        return Effect.succeed(GONE);
      }
      if (taken.status === "denied") {
        return Effect.succeed(DENIED);
      }
      const { approval, request } = taken;
      const issue = sessionToIssue({ approval, collect, host: request.host, sessionUrl: request.sessionUrl ?? null });
      return Effect.map(issueAgentSession(issue), (result) =>
        collectionOf({ created: approval.created, issue, result }),
      );
    };
}

function approveIn(requests: Requests) {
  return (userCode: string, approval: AgentJoinApproval, now: IsoTime): "approved" | "not_found" =>
    Option.match(undeniedByCode(requests, userCode, now), {
      onNone: () => "not_found",
      onSome: (kept) => {
        requests.set(kept.request.requestHash, { ...kept, approval: Option.orElseSome(kept.approval, () => approval) });
        return "approved";
      },
    });
}

function denyIn(requests: Requests) {
  return (userCode: string, now: IsoTime): "denied" | "not_found" =>
    Option.match(
      Option.filter(undeniedByCode(requests, userCode, now), ({ approval }) => Option.isNone(approval)),
      {
        onNone: () => "not_found",
        onSome: (kept) => {
          requests.set(kept.request.requestHash, { ...kept, denied: true });
          return "denied";
        },
      },
    );
}

function addTo(requests: Requests) {
  return (request: NewAgentJoinRequest, now: IsoTime): "added" | "code_taken" => {
    if (Option.isSome(liveByCode(requests, request.userCode, now))) {
      return "code_taken";
    }
    requests.set(request.requestHash, { approval: Option.none(), denied: false, request: { ...request } });
    return "added";
  };
}

function memoryAgentJoinRequests({
  issueAgentSession,
  state,
}: MemoryAgentJoinRequestsOptions): AgentJoinRequestsSection {
  const requests: Requests = new Map();
  const approve = approveIn(requests);
  const add = addTo(requests);
  const deny = denyIn(requests);
  const collect = collectFrom(requests, issueAgentSession);
  function open<Value>(work: () => Value): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Effect.sync(work));
  }
  return {
    addAgentJoinRequest: (request, now) => open(() => add(request, now)),
    approveAgentJoinRequest: (userCode, approval, now) => open(() => approve(userCode, approval, now)),
    collectAgentJoinRequest: (given) =>
      Effect.flatMap(
        open(() => takeFrom(requests, given)),
        collect(given),
      ),
    denyAgentJoinRequest: (userCode, now) => open(() => deny(userCode, now)),
    findAgentJoinRequest: (userCode, now) =>
      open(() => pipe(undeniedByCode(requests, userCode, now), Option.map(shown), Option.getOrUndefined)),
    listPendingAgentJoinRequests: (now) => open(() => pendingIn(requests, now)),
  };
}

interface MemorySectionsOptions {
  readonly state: MemoryState;
  readonly findIdentity: FindIdentity;
}

function memoryAgentSessionSections(
  options: MemorySectionsOptions,
): ReturnType<typeof memoryAgentSessions> & AgentJoinRequestsSection & ReturnType<typeof memoryJoinCodes> {
  const agentSessions = memoryAgentSessions(options);
  const { issueAgentSession } = agentSessions;
  return {
    ...agentSessions,
    ...memoryAgentJoinRequests({ issueAgentSession, state: options.state }),
    ...memoryJoinCodes({ ...options, issueAgentSession }),
  };
}

export { memoryAgentSessionSections };
