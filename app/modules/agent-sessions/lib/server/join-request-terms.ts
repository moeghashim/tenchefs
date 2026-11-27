import type { AgentJoinRequest, StorageUnavailable } from "../../../storage/server.ts";
import { DateTime, Effect, Option, Predicate } from "effect";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import { defaultIdleSeconds, idleSecondsOf } from "./idle-expiry.ts";
import type { AgentJoinRequestView } from "../../index.ts";
import type { Duration } from "effect";
import type { IsoTime } from "../../../time/index.ts";
import type { On } from "./join.ts";
import type { Refusal } from "../../../http/index.ts";
import { defaultIdleExpiry } from "../../index.ts";
import { idleExpiryTooLong } from "./refusals.ts";
import { isoTimeOf } from "../../../time/server.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

interface Terms {
  readonly idleExpiry: string;
  readonly idleSeconds: number;
}

interface Shown {
  readonly found: AgentJoinRequest;
  readonly joins: IdentityName;
  readonly creates: boolean;
  readonly idleExpiry: string;
  readonly live: Option.Option<IsoTime>;
}

interface Lifetime {
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
}

const NOT_FOUND = 404;

const defaults: Terms = { idleExpiry: defaultIdleExpiry, idleSeconds: defaultIdleSeconds };

const REQUEST_SECONDS = 600;

const peopleWaitForBroughtInJoinRequests: Duration.Input = "3 minutes";

interface Requested {
  readonly agent: Identity;
  readonly createdAt: IsoTime;
}

function peopleShownJoinRequestAt({ agent, createdAt }: Requested): IsoTime {
  if (agent.kind !== "agent" || Predicate.isUndefined(agent.broughtInBy)) {
    return createdAt;
  }
  return isoTimeOf(DateTime.addDuration(DateTime.makeUnsafe(createdAt), peopleWaitForBroughtInJoinRequests));
}

const agentJoinRequestNotFound: Refusal = {
  code: "agent_join_request_not_found",
  message:
    "There is no such agent join request: it expired, was collected, or never existed. Run `cookout join` again.",
  status: NOT_FOUND,
};

const FORBIDDEN = 403;

const agentJoinRequestDenied: Refusal = {
  code: "agent_join_request_denied",
  message: "This agent join request was dismissed by someone who could approve it. Ask them before joining again.",
  status: FORBIDDEN,
};

const now: Effect.Effect<IsoTime> = Effect.map(DateTime.now, isoTimeOf);

const lifetime: Effect.Effect<Lifetime> = Effect.map(DateTime.now, (started) => ({
  createdAt: isoTimeOf(started),
  expiresAt: isoTimeOf(DateTime.add(started, { seconds: REQUEST_SECONDS })),
}));

function defaultTerms({ ceilingSeconds, maxIdle }: On): Terms {
  if (defaults.idleSeconds > ceilingSeconds) {
    return { idleExpiry: maxIdle, idleSeconds: ceilingSeconds };
  }
  return defaults;
}

function termsAsked(on: On) {
  return (idleExpiry: string | undefined): Effect.Effect<Terms, Refusal> =>
    Option.match(Option.fromUndefinedOr(idleExpiry), {
      onNone: () => Effect.succeed(defaultTerms(on)),
      onSome: (asked) => {
        const idleSeconds = idleSecondsOf(asked);
        if (idleSeconds > on.ceilingSeconds) {
          return Effect.fail(idleExpiryTooLong(on.maxIdle));
        }
        return Effect.succeed({ idleExpiry: asked, idleSeconds });
      },
    });
}

function lowered(asked: Terms) {
  return (idleExpiry: string | undefined): Effect.Effect<Terms, Refusal> =>
    Option.match(Option.fromUndefinedOr(idleExpiry), {
      onNone: () => Effect.succeed(asked),
      onSome: (lower) => {
        const idleSeconds = idleSecondsOf(lower);
        if (idleSeconds > asked.idleSeconds) {
          return Effect.fail(idleExpiryTooLong(asked.idleExpiry));
        }
        return Effect.succeed({ idleExpiry: lower, idleSeconds });
      },
    });
}

function viewOf({ creates, found, idleExpiry, joins, live }: Shown): AgentJoinRequestView {
  const { agent, approved, clientIp, createdAt, expiresAt, host, userCode } = found;
  const details = { createdAt, kind: "agent_join", where: host } as const;
  let view: AgentJoinRequestView = {
    ...details,
    approved,
    as: agent,
    creates,
    expiresAt,
    host,
    idleExpiry,
    joins,
    userCode,
  };
  if (Predicate.isString(clientIp)) {
    view = { ...view, clientIp };
  }
  return Option.match(live, {
    onNone: () => view,
    onSome: (liveSessionExpiresAt) => ({ ...view, liveSessionExpiresAt }),
  });
}

function liveExpiryOf({ storage }: On) {
  return (identity: IdentityName): Effect.Effect<Option.Option<IsoTime>, StorageUnavailable> =>
    Effect.flatMap(now, (at) =>
      Effect.map(
        storage.findLiveAgentSession({ identity, now: at }),
        Option.map(({ expiresAt }) => expiresAt),
      ),
    );
}

function liveRequest({ storage }: On) {
  return (userCode: string): Fails<AgentJoinRequest> =>
    Effect.flatMap(now, (at) =>
      Effect.flatMap(storage.findAgentJoinRequest(userCode, at), (found) =>
        Effect.mapError(Effect.fromOption(Option.fromUndefinedOr(found)), () => agentJoinRequestNotFound),
      ),
    );
}

export {
  type Lifetime,
  type Terms,
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
};
