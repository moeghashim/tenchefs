import type { WebhookCommand } from "../../webhook-commands/index.ts";
import type { WebhookCommandsState } from "../../board/index.ts";

const SLASH = 1;
const SPACE = 1;
const typedSlashWord = /^\/[a-z0-9-]*$/u;

interface Command {
  readonly name: "schedule";
  readonly description: string;
}

interface CommandRun {
  readonly command: Command;
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

const COMMANDS: readonly Command[] = [{ description: "Schedule a message", name: "schedule" }];

function startingTyped<Named extends { readonly name: string }>({ listed, text }: Typed<Named>): readonly Named[] {
  if (!typedSlashWord.test(text)) {
    return [];
  }
  const prefix = text.slice(SLASH);
  return listed.filter((named) => named.name.startsWith(prefix));
}

function commandRunIn({ listed, text }: Typed<Command>): CommandRun | null {
  for (const command of listed) {
    const word = `/${command.name}`;
    if (text === word || text.startsWith(`${word} `)) {
      return { command, text: text.slice(word.length + SPACE) };
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
