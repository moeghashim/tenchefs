import type { CommandWithSecretResponse, RegisteredWebhookCommand } from "../../index.ts";
import { DateTime, Effect, Option, Predicate } from "effect";
import { handlerOf, isCommandName, isWebhookCommandName } from "../../index.ts";
import { requireDataSchema, webhookCommandNotFound } from "./call.ts";
import type { AddCommandRequestSchema } from "./wire.ts";
import type { Owner } from "../../../identities/index.ts";
import type { Refusal } from "../../../http/index.ts";
import { Secrets } from "../../../secrets/server.ts";
import { Storage } from "../../../storage/server.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import type { WebhookCommandChanges } from "./changes.ts";
import { announced } from "./changes.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { isoTimeOf } from "../../../time/server.ts";

type NewWebhookCommand = typeof AddCommandRequestSchema.Type;

type AddNeeds = Storage | Secrets | WebhookCommandChanges;

const CONFLICT = 409;

function webhookCommandExists(name: string): Refusal {
  return { code: "command_exists", message: `The command ${name} already exists.`, status: CONFLICT };
}

function commandNameTaken(name: string): Refusal {
  return {
    code: "command_exists",
    message: `${name} is a Command's name (/${name}), so no Webhook command can take it.`,
    status: CONFLICT,
  };
}

function notCommandName(name: string): Effect.Effect<void, Refusal> {
  if (isCommandName(name)) {
    return Effect.fail(commandNameTaken(name));
  }
  return Effect.void;
}

function handlerNotAgent(name: string): Refusal {
  return {
    code: "handler_not_agent",
    message: `${name} is a human. A command's handler identity has the command's name and must be an agent.`,
    status: CONFLICT,
  };
}

function stamped(
  fields: NewWebhookCommand,
  createdAt: RegisteredWebhookCommand["createdAt"],
): RegisteredWebhookCommand {
  const handler = Option.getOrThrow(Option.liftPredicate(fields.name, isIdentityName));
  const command = { createdAt, handler, name: fields.name, schema: fields.schema, url: fields.url };
  if (typeof fields.description === "string") {
    return { ...command, description: fields.description };
  }
  return command;
}

function addWebhookCommand({
  fields,
  owner,
}: {
  readonly fields: NewWebhookCommand;
  readonly owner: Owner;
}): Effect.Effect<CommandWithSecretResponse, Refusal | StorageUnavailable, AddNeeds> {
  return Effect.gen(function* addStampedWebhookCommand() {
    const command = yield* notCommandName(fields.name).pipe(
      Effect.andThen(requireDataSchema(fields.schema)),
      Effect.andThen(Effect.map(DateTime.now, (now) => stamped(fields, isoTimeOf(now)))),
    );
    const secrets = yield* Secrets;
    const secret = yield* secrets.newWebhookCommandSecret;
    const storage = yield* Storage;
    const result = yield* storage.addWebhookCommand({ command, secret }, handlerOf({ command, owner }));
    if (result === "name_taken") {
      return yield* Effect.fail(webhookCommandExists(command.name));
    }
    if (result === "handler_is_human") {
      return yield* Effect.fail(handlerNotAgent(command.name));
    }
    return yield* announced({ command, secret });
  });
}

function rotateWebhookCommandSecret(
  name: string,
): Effect.Effect<CommandWithSecretResponse, Refusal | StorageUnavailable, AddNeeds> {
  return Effect.gen(function* rotateSecret() {
    if (!isWebhookCommandName(name)) {
      return yield* Effect.fail(webhookCommandNotFound(name));
    }
    const secrets = yield* Secrets;
    const secret = yield* secrets.newWebhookCommandSecret;
    const storage = yield* Storage;
    const rotated = yield* storage.replaceWebhookCommandSecret(name, secret);
    if (Predicate.isUndefined(rotated)) {
      return yield* Effect.fail(webhookCommandNotFound(name));
    }
    return yield* announced({ command: rotated.command, secret });
  });
}

export { type AddNeeds, addWebhookCommand, rotateWebhookCommandSecret };
