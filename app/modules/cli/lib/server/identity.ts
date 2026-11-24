import { Argument, Command, Flag } from "effect/cli";
import { Effect, Option } from "effect";
import { answer, answered } from "./output.ts";
import { deactivation, identitiesAnswer, identityAnswer } from "./handles.ts";
import type { CallFailure } from "./adapters/sdk.ts";
import { callServer } from "./adapters/sdk.ts";
import { identityKinds } from "../../../identities/index.ts";

const NOTHING = {};

const agentDisplayNameMissing: CallFailure = {
  code: "usage",
  message: "A new agent needs a display name: add --display-name, such as --display-name 'Triage bot'.",
};

const identityName = Argument.String("name").pipe(Argument.withDescription("The identity's name."));

const identityCreateCommand = Command.make(
  "create",
  {
    displayName: Flag.String("display-name").pipe(
      Flag.optional,
      Flag.withDescription(
        "The name shown beside @name, such as 'Ada Lovelace': 1-80 characters after trimming. Required for an agent.",
      ),
    ),
    kind: Flag.Literals("kind", identityKinds).pipe(
      Flag.withDescription("human for a person, agent for a program. It never changes."),
    ),
    name: identityName,
    owner: Flag.String("owner").pipe(
      Flag.optional,
      Flag.withDescription(
        "The human who owns the agent (admin only, unless it is you). Left out, you own it. A human has no owner.",
      ),
    ),
  },
  ({ displayName, kind, name, owner }) => {
    if (kind === "agent" && Option.isNone(displayName)) {
      return answered(Effect.fail(agentDisplayNameMissing));
    }
    const withOwner = Option.match(owner, { onNone: () => NOTHING, onSome: (value) => ({ owner: value }) });
    const named = Option.match(displayName, { onNone: () => NOTHING, onSome: (value) => ({ displayName: value }) });
    return answer((client) => client.createIdentity({ kind, name, ...withOwner, ...named }));
  },
).pipe(
  Command.withDescription(
    "Create an identity. Any human creates agents it owns; only an admin creates humans. Its token is shown this once.",
  ),
);

const identityListCommand = Command.make(
  "list",
  {
    deactivated: Flag.Boolean("deactivated").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Also list deactivated identities, marked deactivated: true."),
    ),
  },
  ({ deactivated }) => {
    if (deactivated) {
      return answered(identitiesAnswer({ include: "deactivated" }));
    }
    return answered(identitiesAnswer({}));
  },
).pipe(
  Command.withDescription(
    "List every active identity with its kind, owner, description and presence (online, or when it was last seen), sorted by name.",
  ),
);

const identityRotateCommand = Command.make("rotate", { name: identityName }, ({ name }) =>
  answer((client) => client.rotateToken(name)),
).pipe(
  Command.withDescription(
    "Issue a new token for an agent you own, or (admin) any identity. The old one stops working at once.",
  ),
);

const identityDeactivateCommand = Command.make("deactivate", { name: identityName }, ({ name }) =>
  answered(deactivation(name)),
).pipe(
  Command.withDescription(
    "Deactivate an identity (admin, or a human for their own agents). Its tokens stop working, and its messages and name stay; a human's agents stay active. On a command's handler it warns on stderr that the command stops replying.",
  ),
);

const identityDeleteCommand = Command.make("delete", { name: identityName }, ({ name }) =>
  answer((client) => client.deleteIdentity(name)),
).pipe(
  Command.withDescription(
    "Delete an identity that has no messages (admin only), with its tokens, read positions, subscriptions and follows. One with messages is refused: deactivate it instead.",
  ),
);

const identityReactivateCommand = Command.make("reactivate", { name: identityName }, ({ name }) =>
  answer((client) => client.reactivateIdentity(name)),
).pipe(
  Command.withDescription(
    "Reactivate a deactivated identity (admin, or a human for their own agents). A fresh token is shown this once.",
  ),
);

const identityAdminCommand = Command.make(
  "admin",
  {
    name: identityName,
    remove: Flag.Boolean("remove").pipe(Flag.withDefault(false), Flag.withDescription("Remove admin instead.")),
  },
  ({ name, remove }) => {
    if (remove) {
      return answer((client) => client.removeAdmin(name));
    }
    return answer((client) => client.makeAdmin(name));
  },
).pipe(Command.withDescription("Make a human an admin, or remove admin with --remove (admin only)."));

const agentName = Argument.String("agent").pipe(Argument.withDescription("The agent's name."));

const identitySessionsCommand = Command.make(
  "sessions",
  {
    agent: agentName,
    revoke: Flag.Boolean("revoke").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Revoke its live agent session token: the session's next request is refused."),
    ),
  },
  ({ agent, revoke }) => {
    if (revoke) {
      return answer((client) => client.revokeAgentSession(agent));
    }
    return answer((client) => client.listAgentSessions(agent));
  },
).pipe(
  Command.withDescription(
    "List an agent's live agent session (issued, last used, expiry, host), or revoke it with --revoke. Owner or admin.",
  ),
);

const identityTransferCommand = Command.make(
  "transfer",
  {
    agent: agentName,
    owner: Flag.String("owner").pipe(Flag.withDescription("The human who is to own the agent.")),
  },
  ({ agent, owner }) => answer((client) => client.transferAgent(agent, owner)),
).pipe(Command.withDescription("Give an agent to another human (admin only). A namespaced agent can't move."));

function textOrClear(what: string): CallFailure {
  return { code: "usage", message: `Give either the ${what} or --clear, not both.` };
}

function textToSend(
  what: string,
  text: Option.Option<string>,
  clear: boolean,
): Effect.Effect<string | null, CallFailure> {
  if (!clear) {
    return Effect.mapError(Effect.fromOption(text), () => textOrClear(what));
  }
  return Option.match(text, { onNone: () => Effect.succeed(null), onSome: () => Effect.fail(textOrClear(what)) });
}

const identityDisplayNameCommand = Command.make(
  "display-name",
  {
    clear: Flag.Boolean("clear").pipe(Flag.withDefault(false), Flag.withDescription("Remove the display name.")),
    name: identityName,
    text: Argument.String("display-name").pipe(
      Argument.optional,
      Argument.withDescription("The display name: 1-80 characters after trimming, such as 'Ada Lovelace'."),
    ),
  },
  ({ clear, name, text }) =>
    answered(
      Effect.flatMap(textToSend("display name", text, clear), (displayName) =>
        callServer((client) => client.setDisplayName(name, displayName)),
      ),
    ),
).pipe(Command.withDescription("Set or clear a display name: your own, your agent's, or (admin) anyone's."));

const identityDescribeCommand = Command.make(
  "describe",
  {
    clear: Flag.Boolean("clear").pipe(Flag.withDefault(false), Flag.withDescription("Remove the description.")),
    name: identityName,
    text: Argument.String("description").pipe(
      Argument.optional,
      Argument.withDescription("What the agent handles: 1-500 characters after trimming, such as 'Ada's to-dos'."),
    ),
  },
  ({ clear, name, text }) =>
    answered(
      Effect.flatMap(textToSend("description", text, clear), (description) =>
        callServer((client) => client.setDescription(name, description)),
      ),
    ),
).pipe(
  Command.withDescription("Set or clear what an agent handles: your agent's, your own as an agent, or (admin) any."),
);

const identityGetCommand = Command.make("get", { name: identityName }, ({ name }) =>
  answered(identityAnswer(name)),
).pipe(
  Command.withDescription(
    "Show one identity, with an agent's description, and on a command's handler the commands it handles.",
  ),
);

const identityCommand = Command.make("identity").pipe(
  Command.withDescription(
    "Create, list, get, rotate, deactivate, reactivate and delete identities, make or remove admins, set display names and agents' descriptions, and manage agents' sessions and owners.",
  ),
  Command.withSubcommands([
    identityCreateCommand,
    identityListCommand,
    identityGetCommand,
    identityRotateCommand,
    identityDeactivateCommand,
    identityReactivateCommand,
    identityDeleteCommand,
    identityAdminCommand,
    identityDisplayNameCommand,
    identityDescribeCommand,
    identitySessionsCommand,
    identityTransferCommand,
  ]),
);

export { identityCommand };
