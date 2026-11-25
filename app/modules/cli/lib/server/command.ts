import { Argument, Command, Flag } from "effect/cli";
import { Effect, Option, Schema } from "effect";
import { printAnswer, refused } from "./output.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { Call } from "./adapters/sdk.ts";
import type { CommandFailed } from "./output.ts";
import { callServer } from "./adapters/sdk.ts";

const NOTHING = {};

const JsonSchemaFile = Schema.Record(Schema.String, Schema.Json);

const JsonText = Schema.fromJsonString(Schema.Json);

function answer<Value>(call: Call<Value>): Effect.Effect<void, CommandFailed, AgentSessionStateNeeds> {
  return Effect.matchEffect(callServer(call), { onFailure: refused, onSuccess: printAnswer });
}

const webhookCommandAddVerb = Command.make(
  "add",
  {
    description: Flag.String("description").pipe(
      Flag.optional,
      Flag.withDescription("What the Webhook command does, 1-500 characters."),
    ),
    name: Argument.String("name").pipe(
      Argument.withDescription("1-64 lowercase letters, digits or '-'. Also the name of its handler identity."),
    ),
    schema: Flag.FileSchema("schema", JsonSchemaFile, { format: "json" }).pipe(
      Flag.withDescription("A JSON file holding the JSON Schema (an object) every call's data must follow."),
    ),
    url: Flag.String("url").pipe(Flag.withDescription("The http or https URL the server posts calls to.")),
  },
  ({ description, name, schema, url }) => {
    const withDescription = Option.match(description, {
      onNone: () => NOTHING,
      onSome: (value) => ({ description: value }),
    });
    return answer((client) => client.addCommand({ name, schema, url, ...withDescription }));
  },
).pipe(
  Command.withDescription(
    "Register a Webhook command (admin only). Its handler is an agent identity with the Webhook command's name, made " +
      "unless an agent of that name exists. The secret deliveries are signed with is shown this once.",
  ),
);

const webhookCommandRotateVerb = Command.make(
  "rotate",
  { name: Argument.String("name").pipe(Argument.withDescription("The Webhook command whose secret to rotate.")) },
  ({ name }) => answer((client) => client.rotateCommandSecret(name)),
).pipe(
  Command.withDescription(
    "Rotate a Webhook command's secret (admin only). The new secret is shown this once, and the old one signs no delivery " +
      "from then on, so give the new one to the Webhook command's handler.",
  ),
);

const webhookCommandListVerb = Command.make("list", {}, () => answer((client) => client.listCommands())).pipe(
  Command.withDescription("List every Webhook command, by name, without its secret."),
);

const webhookCommandCallVerb = Command.make(
  "call",
  {
    channel: Flag.String("channel").pipe(Flag.withDescription("The channel the call message is posted in.")),
    data: Flag.String("data").pipe(
      Flag.withSchema(JsonText),
      Flag.withDescription("The call's data, as JSON. It must follow the Webhook command's schema."),
    ),
    name: Argument.String("name").pipe(Argument.withDescription("The Webhook command to call.")),
  },
  ({ channel, data, name }) => answer((client) => client.callCommand(name, { channel, data })),
).pipe(
  Command.withDescription(
    "Call a Webhook command. Data that breaks its schema is refused with the schema errors and nothing is posted. " +
      "Otherwise the call is posted in the channel as your message, you follow its thread, and the answer is " +
      "{ messageId, threadId } without waiting for the handler.",
  ),
);

export const webhookCommandVerb = Command.make("command").pipe(
  Command.withDescription("Register, rotate the secret of, list and call Webhook commands."),
  Command.withSubcommands([
    webhookCommandAddVerb,
    webhookCommandRotateVerb,
    webhookCommandListVerb,
    webhookCommandCallVerb,
  ]),
);
