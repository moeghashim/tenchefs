import { Argument, Command, Flag } from "effect/cli";
import { Option, Schema } from "effect";
import { identityNamePattern, isIdentityName } from "../../../identities/index.ts";
import { joinCommandRun, leave } from "./join-and-leave.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { CommandFailed } from "./output.ts";
import type { IdentityName } from "../../../identities/index.ts";
import { TIMEOUT_DESCRIPTION } from "./registrations.ts";
import { answered } from "./output.ts";

const identityNameFlag = Schema.String.check(Schema.isPattern(identityNamePattern).abort()).pipe(
  Schema.refine(isIdentityName),
);
const asFlag = Flag.String("as").pipe(
  Flag.withSchema(identityNameFlag),
  Flag.optional,
  Flag.withDescription(
    "The agent to join, as name or owner/name: with your Login, one you own or a new one; with COOKOUT_TOKEN, " +
      "the token's own agent. Required.",
  ),
);
const forceFlag = Flag.Boolean("force").pipe(
  Flag.optional,
  Flag.withDescription(
    "Join even while another session has joined as the agent; its agent session token is revoked at once.",
  ),
);
const displayNameFlag = Flag.String("display-name").pipe(
  Flag.optional,
  Flag.withDescription(
    "The display name of the agent join creates, such as 'Triage bot': 1-80 characters after trimming. Required " +
      "when join creates the agent; refused when the agent already exists.",
  ),
);
const idleExpiryFlag = Flag.String("idle-expiry").pipe(
  Flag.optional,
  Flag.withDescription(
    "How long the agent session token may go unused before it expires, such as 30d or 12h. Default 7d; at most the server's COOKOUT_MAX_IDLE_EXPIRY.",
  ),
);

const sessionUrlFlag = Flag.String("session-url").pipe(
  Flag.optional,
  Flag.withDescription(
    "Where a person can watch this session, such as a cloud session's page: an absolute http or https URL. Shown " +
      "to the agent's owner until the session ends.",
  ),
);

const codeDescription = "A single-use join code: joins the one agent it was made for, within 15 minutes. No --as.";
const codeFlag = Flag.String("code").pipe(Flag.optional, Flag.withDescription(codeDescription));

const printEnvFlag = Flag.Boolean("print-env").pipe(
  Flag.optional,
  Flag.withDescription(
    "Keep nothing: print `export COOKOUT_SESSION=...` with the new agent session token, for one subagent or script.",
  ),
);

const wakeFlag = Flag.Boolean("wake").pipe(
  Flag.optional,
  Flag.withDescription(
    "Also register this session with the runner: cookout join --as <name> --wake -- <wake command…>, as " +
      "cookout runner register does.",
  ),
);

const timeoutFlag = Flag.Int("timeout").pipe(Flag.optional, Flag.withDescription(TIMEOUT_DESCRIPTION));

const wakeCommandArgument = Argument.String("wake-command").pipe(
  Argument.variadic(),
  Argument.withDescription("With --wake, the wake command's argv, after --."),
);

function notForced(): boolean {
  return false;
}

interface JoinInput {
  readonly as: Option.Option<IdentityName>;
  readonly code: Option.Option<string>;
  readonly displayName: Option.Option<string>;
  readonly force: Option.Option<boolean>;
  readonly idleExpiry: Option.Option<string>;
  readonly printEnv: Option.Option<boolean>;
  readonly sessionUrl: Option.Option<string>;
  readonly timeout: Option.Option<number>;
  readonly wake: Option.Option<boolean>;
  readonly wakeCommand: readonly string[];
}

type JoinCommand = Command.Command<"join", JoinInput, object, CommandFailed, AgentSessionStateNeeds>;

const joinCommand: JoinCommand = Command.make(
  "join",
  {
    as: asFlag,
    code: codeFlag,
    displayName: displayNameFlag,
    force: forceFlag,
    idleExpiry: idleExpiryFlag,
    printEnv: printEnvFlag,
    sessionUrl: sessionUrlFlag,
    timeout: timeoutFlag,
    wake: wakeFlag,
    wakeCommand: wakeCommandArgument,
  },
  ({ as, code, displayName, force, idleExpiry, printEnv, sessionUrl, timeout, wake, wakeCommand }) =>
    joinCommandRun({
      as,
      code,
      displayName,
      force: Option.getOrElse(force, notForced),
      idleExpiry,
      printEnv: Option.getOrElse(printEnv, notForced),
      sessionUrl,
      wake: { asked: Option.getOrElse(wake, notForced), command: wakeCommand, timeoutMinutes: timeout },
    }),
).pipe(
  Command.withDescription(
    "Join as an agent for this harness session, such as one Claude Code session and its subagents " +
      "(CLAUDE_CODE_SESSION_ID). With your Login, --as name joins the agent you own by that name, or creates it " +
      "(--display-name is required to create one, and refused otherwise), or owner/name; with COOKOUT_TOKEN, --as is the token's own agent; --code <code> joins the one agent a " +
      "single-use join code was made for, with no other credential; with none of these, --as name asks a person or the agent that " +
      "brought it in to approve, and is refused at once (agent_not_found) when no active agent has that name. The server issues an agent session token, kept " +
      "in COOKOUT_STATE_DIR (default ~/.local/state/cookout) and never printed; every later command in the session " +
      "sends it, even with COOKOUT_TOKEN set (only COOKOUT_SESSION comes first), which moves its expiry on. Prints the agent, whether it was created, the expiry and the credential " +
      "used. A session joins once; outside a harness, join only with --print-env. An agent has one live agent " +
      "session token: a second join is refused unless --force. With --wake -- <wake command…>, join also registers " +
      "the session with the runner (cookout runner register), with --timeout <minutes> for its wake runs.",
  ),
);

const leaveCommand = Command.make("leave", {}, () => answered(leave)).pipe(
  Command.withDescription(
    "Revoke the agent session token this command sends, and forget it if this harness session joined, so another session can join at once.",
  ),
);

export { approveJoinCommand } from "./approve-join.ts";
export { denyJoinCommand } from "./deny-join.ts";
export { onRunnerHost, runnerCommand } from "./runner-command.ts";
export { joinCommand, leaveCommand };
