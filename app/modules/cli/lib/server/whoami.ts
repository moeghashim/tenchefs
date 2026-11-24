import type { ClientWithAgentSessionState, CredentialSource } from "./adapters/sdk.ts";
import { Console, DateTime, Effect, Option } from "effect";
import { callClient, withClient } from "./adapters/sdk.ts";
import type { AgentSessionState } from "./agent-session-state.ts";
import { Command } from "effect/cli";
import type { IdentityResponse } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import { answered } from "./output.ts";
import { cookoutToken } from "../../../config/server.ts";
import { identityWithPresence } from "./presence.ts";

interface WhoamiAnswer extends IdentityResponse {
  readonly joinedAt?: IsoTime;
  readonly source: CredentialSource;
  readonly summary: string;
  readonly url: string;
}

const MILLISECONDS_IN_A_MINUTE = 60_000;
const SHORTEST_SHOWN_MINUTES = 1;
const MINUTES_IN_AN_HOUR = 60;
const HOURS_SHOWN_BEFORE_DAYS = 48;
const HOURS_IN_A_DAY = 24;

function ago(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / MILLISECONDS_IN_A_MINUTE);
  const hours = Math.floor(minutes / MINUTES_IN_AN_HOUR);
  if (minutes < SHORTEST_SHOWN_MINUTES) {
    return "just now";
  }
  if (minutes < MINUTES_IN_AN_HOUR) {
    return `${String(minutes)} min ago`;
  }
  if (hours < HOURS_SHOWN_BEFORE_DAYS) {
    return `${String(hours)} h ago`;
  }
  return `${String(Math.floor(hours / HOURS_IN_A_DAY))} d ago`;
}

function joinedHow({ joinedBy }: AgentSessionState): string {
  if (joinedBy === "agent-join-request") {
    return "agent join request";
  }
  return "agent session token";
}

function joinedAnswer(answer: IdentityResponse, state: AgentSessionState, url: string): Effect.Effect<WhoamiAnswer> {
  const joinedAt = state.issuedAt;
  return Effect.map(DateTime.now, (now) => {
    const since = DateTime.toEpochMillis(now) - DateTime.toEpochMillis(DateTime.makeUnsafe(joinedAt));
    const summary = `${answer.identity.name} (${joinedHow(state)}, joined ${ago(since)}) at ${url}`;
    return { ...answer, joinedAt, source: "agent session token", summary, url };
  });
}

function whoamiAnswer(
  { connection: { url }, joined, source }: ClientWithAgentSessionState,
  answer: IdentityResponse,
): Effect.Effect<WhoamiAnswer> {
  if (Option.isSome(joined)) {
    return joinedAnswer(answer, joined.value.state, url);
  }
  return Effect.succeed({ ...answer, source, summary: `${answer.identity.name} (${source}) at ${url}`, url });
}

function noteIgnoredToken({ joined }: ClientWithAgentSessionState): Effect.Effect<void> {
  return Effect.gen(function* sayTokenIgnored() {
    const token = yield* Effect.orDie(cookoutToken);
    if (token === "" || Option.isNone(joined)) {
      return;
    }
    yield* Console.error(`COOKOUT_TOKEN ignored: this session joined as ${joined.value.state.identity}`);
  });
}

const whoami = withClient((opened) =>
  callClient((client) => client.whoami())(opened).pipe(
    Effect.flatMap((answer) => identityWithPresence({ answer, opened })),
    Effect.flatMap((answer) => Effect.andThen(noteIgnoredToken(opened), whoamiAnswer(opened, answer))),
  ),
);

const whoamiCommand = Command.make("whoami", {}, () => answered(whoami)).pipe(
  Command.withDescription(
    "Show the identity behind the credential this CLI sends, with its presence, the board's URL, and where the credential came from: " +
      "COOKOUT_TOKEN, COOKOUT_SESSION, the agent session token this harness session joined (and when), login, " +
      "or proxy, with COOKOUT_AUTH=proxy, when a proxy adds the credential and the CLI sends none. " +
      "Inside a harness, COOKOUT_SESSION comes first, then the joined session, then COOKOUT_TOKEN; when a set " +
      "COOKOUT_TOKEN was ignored for the joined session, it says so on stderr.",
  ),
);

export { whoamiCommand };
