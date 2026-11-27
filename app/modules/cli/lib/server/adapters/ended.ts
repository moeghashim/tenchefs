import type { AgentSessionState, AgentSessionStateFile } from "../agent-session-state.ts";
import type { CallFailure, CallFailureCode } from "./call-failure.ts";
import { Effect, Option } from "effect";
import { agentSessionExpired, agentSessionRevoked } from "../../../../agent-sessions/index.ts";
import { baseUrlOf } from "../../../../http/client.ts";
import { loginExpired } from "../../../../logins/index.ts";

interface JoinedSession {
  readonly file: AgentSessionStateFile;
  readonly state: AgentSessionState;
}

interface Joined {
  readonly joined: Option.Option<JoinedSession>;
}

interface SavedTo {
  readonly source: string;
  readonly url: string;
}

type OnFailure = (failure: CallFailure) => Effect.Effect<never, CallFailure>;

function isAgentSessionEnded(code: CallFailureCode): boolean {
  return code === agentSessionRevoked || code === agentSessionExpired;
}

function onAgentSessionEnded({ joined }: Joined): OnFailure {
  return (failure) =>
    Effect.gen(function* forgetEndedAgentSession() {
      if (!isAgentSessionEnded(failure.code) || Option.isNone(joined)) {
        return yield* Effect.fail(failure);
      }
      yield* joined.value.file.remove;
      const rejoin = `run \`cookout join --as ${joined.value.state.identity}\` to join again`;
      return yield* Effect.fail({
        ...failure,
        message: `${failure.message} The stored agent session token was deleted; ${rejoin}.`,
      });
    });
}

function isLoginEnded(code: CallFailureCode): boolean {
  return code === loginExpired || code === "token_unknown";
}

function onSavedLoginEnded({ source, url }: SavedTo): OnFailure {
  return (failure) => {
    if (source !== "login" || !isLoginEnded(failure.code)) {
      return Effect.fail(failure);
    }
    const again = `The Login saved for ${baseUrlOf(url)} no longer works: run \`cookout login\` to log in again.`;
    return Effect.fail({ ...failure, message: `${failure.message} ${again}` });
  };
}

export { type JoinedSession, onAgentSessionEnded, onSavedLoginEnded };
