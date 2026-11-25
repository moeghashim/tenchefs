import type { WebhookCommandName, WebhookCommandSecret } from "../../../webhook-commands/index.ts";
import { fixtureOwnerName, identityName } from "./identities.ts";
import { isWebhookCommandName, isWebhookCommandSecret } from "../../../webhook-commands/index.ts";
import type { AgentIdentity } from "../../../identities/index.ts";
import { Option } from "effect";
import type { StoredWebhookCommand } from "../../../storage/server.ts";
import { fixtureTime } from "./time.ts";

interface WebhookCommandFixtureOptions {
  readonly description?: string;
  readonly secret?: string;
}

function webhookCommandName(value: string): WebhookCommandName {
  return Option.getOrThrow(Option.liftPredicate(value, isWebhookCommandName));
}

function secretOf(value: string): WebhookCommandSecret {
  return Option.getOrThrow(Option.liftPredicate(value, isWebhookCommandSecret));
}

function handlerFixture(name: string): AgentIdentity {
  return { admin: false, createdAt: fixtureTime, kind: "agent", name: identityName(name), owner: fixtureOwnerName };
}

function webhookCommandFixture(
  name: string,
  ...options: readonly WebhookCommandFixtureOptions[]
): StoredWebhookCommand {
  const [{ description, secret = `hmac_${name}` } = {}] = options;
  const command = {
    createdAt: fixtureTime,
    handler: identityName(name),
    name: webhookCommandName(name),
    schema: { type: "object" },
    url: `https://hooks.example.com/${name}`,
  };
  if (typeof description === "string") {
    return { command: { ...command, description }, secret: secretOf(secret) };
  }
  return { command, secret: secretOf(secret) };
}

export { type WebhookCommandFixtureOptions, webhookCommandFixture, webhookCommandName, handlerFixture };
