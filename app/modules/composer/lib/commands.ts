import type { CommandName, WebhookCommand } from "../../webhook-commands/index.ts";
import type { WebhookCommandsState } from "../../board/index.ts";
import { commandList } from "../../webhook-commands/index.ts";
import { inlineField } from "./schema-fields.ts";

const SLASH = 1;
const SPACE = 1;
const typedSlashWord = /^\/[a-z0-9-]*$/u;

interface Command {
  readonly name: CommandName;
  readonly description: string;
}

type CommandRun =
  | { readonly kind: "command"; readonly command: Command; readonly text: string }
  | { readonly kind: "call"; readonly webhookCommand: WebhookCommand; readonly field: string; readonly text: string }
  | { readonly kind: "form"; readonly webhookCommand: WebhookCommand };

interface Sent {
  readonly commands: readonly Command[];
  readonly webhookCommands: readonly WebhookCommand[];
  readonly text: string;
}

interface Typed<Named> {
  readonly listed: readonly Named[];
  readonly text: string;
}

interface Unshadowed {
  readonly webhookCommands: readonly WebhookCommand[];
  readonly commands: readonly Command[];
}

const COMMANDS: readonly Command[] = commandList;

function startingTyped<Named extends { readonly name: string }>({ listed, text }: Typed<Named>): readonly Named[] {
  if (!typedSlashWord.test(text)) {
    return [];
  }
  const prefix = text.slice(SLASH);
  return listed.filter((named) => named.name.startsWith(prefix));
}

function typedAfter(name: string, text: string): string | null {
  const word = `/${name}`;
  if (text === word || text.startsWith(`${word} `)) {
    return text.slice(word.length + SPACE);
  }
  return null;
}

function webhookCommandRun(webhookCommand: WebhookCommand, typed: string): CommandRun {
  const field = inlineField(webhookCommand.schema);
  if (field === null || typed === "") {
    return { kind: "form", webhookCommand };
  }
  return { field, kind: "call", text: typed, webhookCommand };
}

function commandRunIn({ commands, text, webhookCommands }: Sent): CommandRun | null {
  for (const command of commands) {
    const typed = typedAfter(command.name, text);
    if (typed !== null) {
      return { command, kind: "command", text: typed };
    }
  }
  for (const webhookCommand of webhookCommands) {
    const typed = typedAfter(webhookCommand.name, text);
    if (typed !== null) {
      return webhookCommandRun(webhookCommand, typed);
    }
  }
  return null;
}

function withoutCommands({ commands, webhookCommands }: Unshadowed): readonly WebhookCommand[] {
  return webhookCommands.filter((webhookCommand) => !commands.some((command) => command.name === webhookCommand.name));
}

function channelWebhookCommands(listed: WebhookCommandsState): readonly WebhookCommand[] {
  if (listed.status !== "loaded") {
    return [];
  }
  return withoutCommands({ commands: COMMANDS, webhookCommands: listed.webhookCommands });
}

export { type Command, type CommandRun, COMMANDS, channelWebhookCommands, commandRunIn, startingTyped };
