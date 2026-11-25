import type {
  BuiltInCommand,
  CallCommandResponse,
  CommandWithSecretResponse,
  ListCommandsResponse,
  RegisteredWebhookCommand,
} from "../../index.ts";
import { identityNamePattern, isIdentityName } from "../../../identities/index.ts";
import { isWebUrl, matchesWire } from "../../../http/index.ts";
import {
  isWebhookCommandName,
  isWebhookCommandSecret,
  webhookCommandDescriptionLength,
  webhookCommandNamePattern,
  webhookCommandSecretPattern,
  webhookCommandUrlMaximumLength,
} from "../../index.ts";
import { ChannelNameSchema } from "../../../channels/server.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import { MessageIdSchema } from "../../../messages/server.ts";
import { Schema } from "effect";

const WebhookCommandNameSchema = Schema.String.check(
  Schema.isPattern(webhookCommandNamePattern, { message: "Use 1-64 lowercase letters, digits or '-'." }).abort(),
).pipe(Schema.refine(isWebhookCommandName, { identifier: "CommandName" }));

const HandlerNameSchema = Schema.String.check(Schema.isPattern(identityNamePattern).abort()).pipe(
  Schema.refine(isIdentityName, { identifier: "IdentityName" }),
);

const UrlSchema = Schema.String.check(
  Schema.isMaxLength(webhookCommandUrlMaximumLength).abort(),
  Schema.makeFilter(isWebUrl, { message: "Use an http or https URL." }),
);

const JsonSchemaSchema = Schema.Record(Schema.String, Schema.Json);

const DescriptionSchema = Schema.String.check(
  Schema.isBetweenLength(webhookCommandDescriptionLength.minimum, webhookCommandDescriptionLength.maximum),
);

const SecretSchema = Schema.String.check(Schema.isPattern(webhookCommandSecretPattern)).pipe(
  Schema.refine(isWebhookCommandSecret, { identifier: "CommandSecret" }),
);

const webhookCommandFields = {
  createdAt: IsoTimeSchema,
  description: Schema.optionalKey(DescriptionSchema),
  handler: HandlerNameSchema,
  name: WebhookCommandNameSchema,
  schema: JsonSchemaSchema,
};

const BuiltInCommandSchema = matchesWire<BuiltInCommand>()(
  Schema.Struct({ ...webhookCommandFields, builtIn: Schema.Literal(true) }),
);

const RegisteredWebhookCommandSchema = matchesWire<RegisteredWebhookCommand>()(
  Schema.Struct({ ...webhookCommandFields, url: Schema.String }),
);

const ListedWebhookCommandSchema = Schema.Union([RegisteredWebhookCommandSchema, BuiltInCommandSchema]);

export { RegisteredWebhookCommandSchema };

export const AddCommandRequestSchema = Schema.Struct({
  description: Schema.optionalKey(DescriptionSchema),
  name: WebhookCommandNameSchema,
  schema: JsonSchemaSchema,
  url: UrlSchema,
});

export const CommandWithSecretResponseSchema = matchesWire<CommandWithSecretResponse>()(
  Schema.Struct({ command: RegisteredWebhookCommandSchema, secret: SecretSchema }),
);

export const ListCommandsResponseSchema = matchesWire<ListCommandsResponse>()(
  Schema.Struct({ commands: Schema.Array(ListedWebhookCommandSchema) }),
);

export const CallCommandRequestSchema = Schema.Struct({ channel: ChannelNameSchema, data: Schema.Json });

export const CallCommandResponseSchema = matchesWire<CallCommandResponse>()(
  Schema.Struct({ messageId: MessageIdSchema, threadId: MessageIdSchema }),
);
