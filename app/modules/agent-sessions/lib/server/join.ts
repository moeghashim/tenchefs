import type { AgentSessionResponse, JoinRequest } from "../../index.ts";
import { DateTime, Effect, Option } from "effect";
import type { DisplayName, Identity, IdentityName } from "../../../identities/index.ts";
import type { Storage, StorageUnavailable, StoredAgentSession } from "../../../storage/server.ts";
import { agentSessionLive, idleExpiryTooLong, withParent } from "./refusals.ts";
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
  readonly sessionUrl: Option.Option<string>;
}

function idleSecondsFor({ ceilingSeconds, maxIdle }: On, asked: string): Effect.Effect<number, Refusal> {
  const idleSeconds = idleSecondsOf(asked);
  if (idleSeconds > ceilingSeconds) {
    return Effect.fail(idleExpiryTooLong(maxIdle));
  }
  return Effect.succeed(idleSeconds);
}

interface Stored {
  readonly joined: StoredAgentSession;
  readonly host: Option.Option<string>;
  readonly sessionUrl: Option.Option<string>;
}

function storedSession({ host, joined, sessionUrl }: Stored): StoredAgentSession {
  const from = Option.match(host, { onNone: () => joined, onSome: (named) => ({ ...joined, host: named }) });
  return Option.match(sessionUrl, { onNone: () => from, onSome: (url) => ({ ...from, sessionUrl: url }) });
}

function issuer({ secrets, storage }: On) {
  return ({ agent, created, force, host, idleSeconds, sessionUrl }: Issue): Fails<AgentSessionResponse> =>
    Effect.gen(function* issueAgentSession() {
      const agentSessionToken = yield* secrets.newToken;
      const hash = yield* secrets.hashToken(agentSessionToken);
      const now = yield* DateTime.now;
      const times = { expiresAt: isoTimeOf(DateTime.add(now, { seconds: idleSeconds })), issuedAt: isoTimeOf(now) };
      const session = storedSession({
        host,
        joined: { ...times, hash, identity: agent.name, idleSeconds },
        sessionUrl,
      });
      const issued = yield* Effect.flatMap(withParent({ force, session }), storage.issueAgentSession);
      if (issued.status === "live") {
        return yield* Effect.fail(agentSessionLive({ expiresAt: issued.expiresAt, identity: agent.name }));
      }
      const answer = { ...times, agentSessionToken, created, identity: agent.name };
      return Option.match(sessionUrl, { onNone: () => answer, onSome: (url) => ({ ...answer, sessionUrl: url }) });
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
      const sessionUrl = Option.fromUndefinedOr(request.sessionUrl);
      const force = request.force === true;
      const issued = yield* issue({ agent, created, force, host, idleSeconds, sessionUrl });
      return yield* Effect.as(on.publishSession(agent.name), issued);
    });
}

export { type Join, type On, joiner };
