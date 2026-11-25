import { Argument, Command } from "effect/cli";
import { answer } from "./output.ts";

const codeArgument = Argument.String("code").pipe(
  Argument.withDescription("The user code the joining agent printed, such as WDJB-MJHT."),
);

const denyJoinCommand = Command.make("deny-join", { code: codeArgument }, ({ code }) =>
  answer((client) => client.denyAgentJoin(code)),
).pipe(
  Command.withDescription(
    "Dismiss a pending `cookout join --as <name>` by the user code it printed, when you could approve it but won't " +
      "(for example, the agent is already joined in another session). It leaves every approver's list, and the " +
      "waiting join stops with agent_join_request_denied. Prints the request as denied.",
  ),
);

export { denyJoinCommand };
