import type { AgentAt, StorageUnavailable } from "../../../storage/server.ts";
import type { AgentSessionResponse, ListAgentSessionsResponse, RevokeAgentSessionResponse } from "../../index.ts";
import { Context, DateTime, Duration, Effect, Option } from "effect";
import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import type { Join, On } from "./join.ts";
import type { JoinRequestChange, JoinRequestChanges, JoinRequests } from "./join-requests.ts";
import type { PubSub, Scope } from "effect";
import { agentSessionExpired, agentSessionRevoked } from "../../index.ts";
import type { JoinCodes } from "./join-codes.ts";
import type { Refusal } from "../../../http/index.ts";
import type { TokensEnded } from "../../../identities/server.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { joinCodesOn } from "./join-codes.ts";
import { joinRequestsOn } from "./join-requests.ts";
import { joiner } from "./join.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

interface Ends {
  readonly endTokens: (ended: TokensEnded) => Effect.Effect<void>;
  readonly joinRequestChanges: JoinRequestChanges;
}

const AGENT_SESSIONS = { kind: "agent sessions" } as const;

interface AgentSessionsService extends JoinRequests, JoinCodes {
  readonly join: (caller: Identity, request: Join) => Fails<AgentSessionResponse>;
  readonly leave: (agent: IdentityName, hash: TokenHash) => Effect.Effect<void, StorageUnavailable>;
  readonly untilEnded: (hash: TokenHash) => Effect.Effect<Refusal, StorageUnavailable>;
  readonly listFor: (identity: IdentityName) => Effect.Effect<ListAgentSessionsResponse, StorageUnavailable>;
  readonly revokeFor: (
    identity: IdentityName,
    by: IdentityName,
  ) => Effect.Effect<RevokeAgentSessionResponse, StorageUnavailable>;
  readonly sessionChanged: Effect.Effect<PubSub.Subscription<Identity>, never, Scope.Scope>;
  readonly joinRequestChanged: Effect.Effect<PubSub.Subscription<JoinRequestChange>, never, Scope.Scope>;
}

class AgentSessions extends Context.Service<AgentSessions, AgentSessionsService>()(
  "@ai-hero/cookout/agent-sessions/lib/server/service/AgentSessions",
) {}

const CHECK_SECONDS = 30;
const UNAUTHORIZED = 401;

const endedRefusals: Readonly<Record<"expired" | "revoked", Refusal>> = {
  expired: {
    code: agentSessionExpired,
    message: "This session's agent session token expired. Join again.",
    status: UNAUTHORIZED,
  },
  revoked: {
    code: agentSessionRevoked,
    message: "This session's agent session token was revoked. Join again.",
    status: UNAUTHORIZED,
  },
};

function endedRefusal(status: string): Refusal {
  if (status === "expired") {
    return endedRefusals.expired;
  }
  return endedRefusals.revoked;
}

function watcher({ storage }: On) {
  return (hash: TokenHash): Effect.Effect<Refusal, StorageUnavailable> => {
    const check = Effect.flatMap(DateTime.now, (now) => storage.useAgentSession({ hash, now: isoTimeOf(now) }));
    return Effect.delay(check, Duration.seconds(CHECK_SECONDS)).pipe(
      Effect.repeat({ until: (used) => used.status !== "active" }),
      Effect.map(({ status }) => endedRefusal(status)),
    );
  };
}

function agentNow(identity: IdentityName): Effect.Effect<AgentAt> {
  return Effect.map(DateTime.now, (now) => ({ identity, now: isoTimeOf(now) }));
}

function ownerViews({
  endTokens,
  publishSession,
  storage,
}: On & Ends): Pick<AgentSessionsService, "listFor" | "revokeFor"> {
  return {
    listFor: (identity) =>
      agentNow(identity).pipe(
        Effect.flatMap(storage.findLiveAgentSession),
        Effect.map((live) => ({ agentSessions: Option.toArray(live) })),
      ),
    revokeFor: (identity, by) =>
      agentNow(identity).pipe(
        Effect.flatMap(storage.revokeLiveAgentSession),
        Effect.tap((revoked) => Effect.when(publishSession(identity), Effect.succeed(revoked))),
        Effect.tap(() => endTokens({ by, cause: "revoked", identity, tokens: AGENT_SESSIONS })),
        Effect.map((revoked) => ({ revoked })),
      ),
  };
}

function forcedJoiner(on: On & Ends): AgentSessionsService["join"] {
  const join = joiner(on);
  return (caller, request) =>
    Effect.tap(join(caller, request), ({ identity }) =>
      Effect.when(
        on.endTokens({ by: caller.name, cause: "revoked", identity, tokens: AGENT_SESSIONS }),
        Effect.succeed(request.force === true),
      ),
    );
}

function agentSessionsOn(on: On & Ends): Omit<AgentSessionsService, "sessionChanged" | "joinRequestChanged"> {
  return {
    join: forcedJoiner(on),
    leave: (agent, hash) =>
      Effect.andThen(on.storage.revokeAgentSession(hash), on.publishSession(agent)).pipe(
        Effect.andThen(
          on.endTokens({ by: agent, cause: "left", identity: agent, tokens: { hash, kind: "agent session" } }),
        ),
      ),
    untilEnded: watcher(on),
    ...ownerViews(on),
    ...joinRequestsOn(on),
    ...joinCodesOn(on),
  };
}

export { AgentSessions, agentSessionsOn };
