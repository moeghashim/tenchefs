/**
 * Commands on the backend: the routes that register a command and rotate its
 * secret (admin only), list them and call one (any identity). Adding a command checks its schema
 * compiles, makes its handler identity, an agent with the command's name
 * (ADR 0027), or reuses an agent of that name, and issues the command's
 * secret from `Secrets`, shown once; the live stream announces it to every web UI. Rotating issues a new secret the same way,
 * and the old one signs no delivery from then on. A call's data is checked against the
 * command's JSON Schema, then posted by the caller as a top-level message, or as a reply in the thread of its `replyTo`,
 * and the answer comes without waiting for any delivery to the webhook.
 * `webhookCommandsLayer` sends each call to the command's URL in the background:
 * `{ command, data, channel, threadId, token, callId }` as JSON, signed in the
 * `cookout-signature` header with the hex HMAC-SHA256 of the raw body keyed
 * with the command's secret, and given up after `COOKOUT_WEBHOOK_TIMEOUT_SECONDS`. A delivery with no `2xx` (a redirect is never followed, so it
 * counts as one) is retried 5 times with the same `callId`, with exponential backoff from `COOKOUT_WEBHOOK_RETRY_DELAY_SECONDS` by
 * `COOKOUT_WEBHOOK_RETRY_FACTOR`; after the last failure the handler identity replies in the call's thread that the
 * delivery failed. Each delivery's `attempts` is stored: the attempts made at it so far, the first included (6 at
 * most). So a restarted server resumes the pending ones on the same backoff with the same `callId`, making only the
 * attempts left, and with a new command token that still expires 24 h after the call.
 */
import {
  AddCommandRequestSchema,
  CallCommandRequestSchema,
  CallCommandResponseSchema,
  CommandWithSecretResponseSchema,
  ListCommandsResponseSchema,
} from "./lib/server/wire.ts";
import { Caller, requireAdmin } from "../identities/server.ts";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { addWebhookCommand, rotateWebhookCommandSecret } from "./lib/server/add.ts";
import { webhookCommandCallsPath, webhookCommandSecretPath, webhookCommandsPath } from "./index.ts";
import type { AddNeeds } from "./lib/server/add.ts";
import type { CallNeeds } from "./lib/server/call.ts";
import { Effect } from "effect";
import type { Route } from "../http/server.ts";
import { Storage } from "../storage/server.ts";
import { callWebhookCommand } from "./lib/server/call.ts";

const CREATED = 201;
const ACCEPTED = 202;

const addRoute: Route<Caller | AddNeeds> = {
  handle: () =>
    Effect.gen(function* addWebhookCommandRoute() {
      yield* requireAdmin;
      const caller = yield* Caller;
      const fields = yield* HttpServerRequest.schemaBodyJson(AddCommandRequestSchema, { errors: "all" });
      const added = yield* addWebhookCommand({ fields, owner: caller.name });
      return yield* HttpServerResponse.schemaJson(CommandWithSecretResponseSchema)(added, { status: CREATED });
    }),
  method: "POST",
  path: webhookCommandsPath,
};

const rotateRoute: Route<Caller | AddNeeds> = {
  handle: (params) =>
    Effect.gen(function* rotateSecretRoute() {
      yield* requireAdmin;
      const rotated = yield* rotateWebhookCommandSecret(String(params["name"]));
      return yield* HttpServerResponse.schemaJson(CommandWithSecretResponseSchema)(rotated);
    }),
  method: "POST",
  path: webhookCommandSecretPath,
};

const listRoute: Route<Storage> = {
  handle: () =>
    Effect.gen(function* listWebhookCommandsRoute() {
      const storage = yield* Storage;
      const commands = yield* storage.listWebhookCommands;
      return yield* HttpServerResponse.schemaJson(ListCommandsResponseSchema)({ commands });
    }),
  method: "GET",
  path: webhookCommandsPath,
};

const callRoute: Route<Caller | CallNeeds> = {
  handle: (params) =>
    Effect.gen(function* callWebhookCommandRoute() {
      const fields = yield* HttpServerRequest.schemaBodyJson(CallCommandRequestSchema, { errors: "all" });
      const caller = yield* Caller;
      const called = yield* callWebhookCommand({ ...fields, caller, name: String(params["name"]) });
      return yield* HttpServerResponse.schemaJson(CallCommandResponseSchema)(called, { status: ACCEPTED });
    }),
  method: "POST",
  path: webhookCommandCallsPath,
};

/** The command routes, for the server's route list. They need `Caller`, which `requireToken` provides. */
export const webhookCommandRoutes: readonly Route<Caller | AddNeeds | CallNeeds>[] = [
  addRoute,
  rotateRoute,
  listRoute,
  callRoute,
];

/** The response Schemas of the command routes, for the SDK's generated validators. */
export const webhookCommandResponseSchemas = {
  CallCommandResponse: CallCommandResponseSchema,
  CommandWithSecretResponse: CommandWithSecretResponseSchema,
  ListCommandsResponse: ListCommandsResponseSchema,
};

/**
 * The background webhook delivery of each call, which the command routes need beyond storage. On start it resumes the
 * deliveries a stopped server left pending, with the same call IDs.
 */
export { deliveriesLayer as webhookCommandsLayer } from "./lib/server/call.ts";

/**
 * The `WebhookCommandChanges` hub: registering a command and rotating its secret each publish the command, and the live
 * stream sends each on as a `command` event.
 */
export { WebhookCommandChanges, webhookCommandChangesLayer } from "./lib/server/changes.ts";

/** The Schema of a command as the server shows it, for the live stream's `command` event. */
export { RegisteredWebhookCommandSchema } from "./lib/server/wire.ts";
