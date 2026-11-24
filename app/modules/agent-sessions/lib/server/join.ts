import type { AgentSessionResponse, JoinRequest } from "../../index.ts";
import { DateTime, Effect, Option } from "effect";
import type { DisplayName, Identity, IdentityName } from "../../../identities/index.ts";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import { agentSessionLive, idleExpiryTooLong } from "./refusals.ts";
import { defaultIdleSeconds, idleSecondsOf } from "./idle-expiry.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Secrets } from "../../../secrets/server.ts";
import { agentToJoin } from "./resolve.ts";
import { isoTimeOf } from "../../../time/server.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

interface Join extends Omit<JoinRequest, "as" | "displayName"> {
  readonly as: IdentityName;
  readonly displayName?: DisplayName;
}

interface On {
  readonly publishIdentity: (identity: Identity) => Effect.Effect<void>;
  readonly publishSession: (agent: IdentityName) => Effect.Effect<void, StorageUnavailable>;
  readonly maxIdle: string;
  readonly ceilingSeconds: number;
  readonly secrets: Secrets["Service"];
  readonly storage: Storage["Service"];
}

interface Issue {
  readonly agent: Identity;
  readonly created: boolean;
  readonly force: boolean;
  readonly idleSeconds: number;
  readonly host: Option.Option<string>;
}

function idleSecondsFor({ ceilingSeconds, maxIdle }: On, asked: string): Effect.Effect<number, Refusal> {
  const idleSeconds = idleSecondsOf(asked);
  if (idleSeconds > ceilingSeconds) {
    return Effect.fail(idleExpiryTooLong(maxIdle));
  }
  return Effect.succeed(idleSeconds);
}

function issuer({ secrets, storage }: On) {
  return ({ agent, created, force, host, idleSeconds }: Issue): Fails<AgentSessionResponse> =>
    Effect.gen(function* issueAgentSession() {
      const agentSessionToken = yield* secrets.newToken;
      const hash = yield* secrets.hashToken(agentSessionToken);
      const now = yield* DateTime.now;
      const times = { expiresAt: isoTimeOf(DateTime.add(now, { seconds: idleSeconds })), issuedAt: isoTimeOf(now) };
      const joined = { ...times, hash, identity: agent.name, idleSeconds };
      const session = Option.match(host, { onNone: () => joined, onSome: (from) => ({ ...joined, host: from }) });
      const issued = yield* storage.issueAgentSession({ force, session });
      if (issued.status === "live") {
        return yield* Effect.fail(agentSessionLive({ expiresAt: issued.expiresAt, identity: agent.name }));
      }
      return { ...times, agentSessionToken, created, identity: agent.name };
    });
}

function joiner(on: On) {
  const issue = issuer(on);
  return (caller: Identity, request: Join): Fails<AgentSessionResponse> =>
    Effect.gen(function* joinAs() {
      const { created, identity: agent } = yield* agentToJoin({ as: request.as, caller, naming: request, on });
      const idleSeconds = yield* Option.match(Option.fromUndefinedOr(request.idleExpiry), {
        onNone: () => Effect.succeed(Math.min(defaultIdleSeconds, on.ceilingSeconds)),
        onSome: (asked) => idleSecondsFor(on, asked),
      });
      const host = Option.fromUndefinedOr(request.host);
      const issued = yield* issue({ agent, created, force: request.force === true, host, idleSeconds });
      return yield* Effect.as(on.publishSession(agent.name), issued);
    });
}

export { type Join, type On, joiner };
