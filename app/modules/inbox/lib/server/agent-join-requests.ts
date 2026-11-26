import { Array as Arr, DateTime, Effect, Option } from "effect";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { PendingAgentJoinRequest, Storage, StorageUnavailable } from "../../../storage/server.ts";
import type { InboxAgentJoinRequest } from "../agent-join-requests.ts";
import type { IsoTime } from "../../../time/index.ts";
import { agentJoinRequestText } from "../agent-join-requests.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { peopleShownJoinRequestAt } from "../../../agent-sessions/server.ts";

type Listed = Effect.Effect<readonly InboxAgentJoinRequest[], StorageUnavailable>;

interface Changed {
  readonly caller: Identity;
  readonly agent: IdentityName;
}

interface AgentJoinRequestCalls {
  readonly agentJoinRequests: (caller: Identity) => Listed;
  readonly agentJoinRequestsAfterChange: (
    changed: Changed,
  ) => Effect.Effect<Option.Option<readonly InboxAgentJoinRequest[]>, StorageUnavailable>;
}

const ONE_AT_A_TIME = { concurrency: 1 } as const;

function mayApprove(caller: IdentityName, agent: Identity): boolean {
  if (agent.kind !== "agent" || agent.deactivated === true) {
    return false;
  }
  return agent.owner === caller || agent.broughtInBy === caller;
}

interface Showing {
  readonly storage: Storage["Service"];
  readonly caller: Identity;
  readonly now: IsoTime;
}

function shownNow({ caller, now }: Showing, pending: PendingAgentJoinRequest) {
  return (agent: Identity): boolean =>
    mayApprove(caller.name, agent) &&
    (caller.kind === "agent" || peopleShownJoinRequestAt({ agent, createdAt: pending.createdAt }) <= now);
}

function itemOf(pending: PendingAgentJoinRequest, { now, storage }: Showing) {
  return (agent: Identity): Effect.Effect<InboxAgentJoinRequest, StorageUnavailable> =>
    Effect.map(storage.findLiveAgentSession({ identity: agent.name, now }), (live) => {
      const { createdAt, expiresAt, host, userCode } = pending;
      const item = { agent, createdAt, expiresAt, host, text: agentJoinRequestText(pending), userCode };
      return Option.match(live, {
        onNone: () => item,
        onSome: (session) => ({ ...item, liveSessionExpiresAt: session.expiresAt }),
      });
    });
}

function shownTo(showing: Showing) {
  return (pending: PendingAgentJoinRequest): Listed =>
    Effect.flatMap(showing.storage.findIdentityByName(pending.agent), (found) =>
      Effect.forEach(
        Arr.filter(Arr.fromNullishOr(found), shownNow(showing, pending)),
        itemOf(pending, showing),
        ONE_AT_A_TIME,
      ),
    );
}

function listedFor(storage: Storage["Service"]): AgentJoinRequestCalls["agentJoinRequests"] {
  return (caller) =>
    Effect.gen(function* listAgentJoinRequests() {
      const clock = yield* DateTime.now;
      const now = isoTimeOf(clock);
      const pending = yield* storage.listPendingAgentJoinRequests(now);
      const shown = yield* Effect.forEach(pending, shownTo({ caller, now, storage }), ONE_AT_A_TIME);
      return Arr.flatten(shown);
    });
}

function agentJoinRequestsOn(storage: Storage["Service"]): AgentJoinRequestCalls {
  const agentJoinRequests = listedFor(storage);
  return {
    agentJoinRequests,
    agentJoinRequestsAfterChange: ({ agent, caller }) =>
      Effect.flatMap(storage.findIdentityByName(agent), (found) => {
        if (!Arr.some(Arr.fromNullishOr(found), (shown) => mayApprove(caller.name, shown))) {
          return Effect.succeedNone;
        }
        return Effect.asSome(agentJoinRequests(caller));
      }),
  };
}

export { agentJoinRequestsOn };
