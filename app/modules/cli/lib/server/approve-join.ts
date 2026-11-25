import { Argument, Command, Flag } from "effect/cli";
import type { ApproveAgentJoinRequest } from "../../../agent-sessions/index.ts";
import { Option } from "effect";
import { answer } from "./output.ts";

const NOTHING = {};

const codeArgument = Argument.String("code").pipe(
  Argument.withDescription("The user code the joining agent printed, such as WDJB-MJHT."),
);

const idleExpiryFlag = Flag.String("idle-expiry").pipe(
  Flag.optional,
  Flag.withDescription("A shorter idle expiry than the joining agent asked for, such as 1d. Never longer."),
);

const forceFlag = Flag.Boolean("force").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Replace the agent's live agent session token, as join --force does."),
);

interface Approval {
  readonly idleExpiry: Option.Option<string>;
  readonly force: boolean;
}

function approvalOf({ force, idleExpiry }: Approval): ApproveAgentJoinRequest {
  const lowered = Option.match(idleExpiry, { onNone: () => NOTHING, onSome: (value) => ({ idleExpiry: value }) });
  if (force) {
    return { ...lowered, force };
  }
  return lowered;
}

const approveJoinCommand = Command.make(
  "approve-join",
  { code: codeArgument, force: forceFlag, idleExpiry: idleExpiryFlag },
  ({ code, ...approval }) => answer((client) => client.approveAgentJoin(code, approvalOf(approval))),
).pipe(
  Command.withDescription(
    "Approve another agent's `cookout join --as <name>` by the user code it printed, as a person does on the " +
      "approval page. A human approves as on that page. An agent approves only a join for its own owner, and only " +
      "for an agent it brought in (create it first with `cookout identity create`): approving never creates an agent. " +
      "The joining agent collects its own agent session token. Prints the request as approved.",
  ),
);

export { approveJoinCommand };
