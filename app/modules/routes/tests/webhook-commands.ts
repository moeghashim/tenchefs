import type { JsonSchema, RegisteredWebhookCommand } from "../../webhook-commands/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { fireEvent, screen, within } from "@testing-library/react";
import type { CookoutClient } from "../../sdk/index.ts";
import { isIdentityName } from "../../identities/index.ts";
import { isIsoTime } from "../../time/index.ts";
import { isWebhookCommandName } from "../../webhook-commands/index.ts";
import { openAt } from "./render.tsx";

const formSchema = {
  properties: { branch: { type: "string" }, count: { type: "integer" } },
  required: ["branch"],
  type: "object",
} as const;
const noProperties = { required: ["branch"], type: "object" } as const;
const nowhere = "http://127.0.0.1:9/command";
const INDENT = 2;

interface Registered {
  readonly name: string;
  readonly schema?: JsonSchema;
  readonly description?: string;
}

interface InChannel {
  readonly channel: string;
  readonly webhookCommand: Registered;
}

interface Opened {
  readonly channel: string;
  readonly client?: CookoutClient;
}

interface Filled {
  readonly webhookCommand: string;
  readonly field: string;
  readonly value: string;
}

interface Typed {
  readonly webhookCommand: string;
  readonly texts: Readonly<Record<string, string>>;
  readonly checks: readonly string[];
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, INDENT);
}

async function addWebhookCommand(command: Registered): Promise<CookoutClient> {
  const { name } = command;
  const handler = await newIdentity({ kind: "agent", name, owner: "admin" });
  await adminClient().addCommand({ ...command, schema: command.schema ?? formSchema, url: nowhere });
  return handler.client;
}

interface Stored {
  readonly client: CookoutClient;
  readonly name: string;
}

const storedAt = "2026-01-01T00:00:00.000Z";

function storedUnder(name: string): RegisteredWebhookCommand {
  if (isWebhookCommandName(name) && isIdentityName(name) && isIsoTime(storedAt)) {
    return { createdAt: storedAt, handler: name, name, schema: formSchema, url: nowhere };
  }
  throw new Error(`${name} is not a Webhook command name`);
}

function withStoredWebhookCommand({ client, name }: Stored): CookoutClient {
  const stored = storedUnder(name);
  return new Proxy(client, {
    get: (target, key): unknown => {
      const value: unknown = Reflect.get(target, key);
      if (typeof value !== "function") {
        return value;
      }
      return async (...args: readonly unknown[]): Promise<unknown> => {
        const answer: unknown = await Reflect.apply(value, target, args);
        if (key !== "listCommands") {
          return answer;
        }
        const listed = await target.listCommands();
        return { commands: [...listed.commands, stored] };
      };
    },
  });
}

async function channelWithWebhookCommand({ channel, webhookCommand: command }: InChannel): Promise<CookoutClient> {
  await adminClient().createChannel({ name: channel });
  return addWebhookCommand(command);
}

async function openChannel({ channel, client = adminClient() }: Opened): Promise<() => void> {
  const close = openAt({ client, hash: `#/channels/${channel}` });
  await screen.findByLabelText("Message");
  return close;
}

function type(text: string): void {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
}

async function suggestedFor(text: string): Promise<readonly (string | null)[]> {
  type(text);
  const list = await screen.findByRole("listbox", { name: "Command suggestions" });
  const shown: (string | null)[] = [];
  for (const item of within(list).getAllByRole("option")) {
    shown.push(item.textContent);
  }
  return shown;
}

function promptFor(command: string): HTMLElement {
  return screen.getByRole("form", { name: `Call /${command}` });
}

async function pickWebhookCommand(command: string): Promise<HTMLElement> {
  type(`/${command}`);
  const list = await screen.findByRole("listbox", { name: "Command suggestions" });
  fireEvent.mouseDown(within(list).getByRole("option", { name: new RegExp(`^/${command}`, "u") }));
  return promptFor(command);
}

function fill({ webhookCommand: command, field, value }: Filled): void {
  fireEvent.change(within(promptFor(command)).getByLabelText(field), { target: { value } });
}

function send(command: string): void {
  fireEvent.click(within(promptFor(command)).getByRole("button", { name: "Call" }));
}

async function callWith(filled: Filled): Promise<HTMLElement> {
  const prompt = await pickWebhookCommand(filled.webhookCommand);
  fill(filled);
  send(filled.webhookCommand);
  return prompt;
}

async function callWithFields({ checks, webhookCommand: command, texts }: Typed): Promise<void> {
  const prompt = await pickWebhookCommand(command);
  for (const [field, value] of Object.entries(texts)) {
    fill({ field, value, webhookCommand: command });
  }
  for (const field of checks) {
    fireEvent.click(within(prompt).getByLabelText(field));
  }
  send(command);
}

export {
  addWebhookCommand,
  callWith,
  callWithFields,
  channelWithWebhookCommand,
  noProperties,
  openChannel,
  pickWebhookCommand,
  pretty,
  suggestedFor,
  type,
  type InChannel,
  withStoredWebhookCommand,
};
