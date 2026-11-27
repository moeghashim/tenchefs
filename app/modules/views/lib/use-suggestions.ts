import type { Command, Draft } from "../../composer/index.ts";
import { useCallback, useMemo } from "react";
import type { Identity } from "../../sdk/index.ts";
import type { MentionOption } from "./mention-option.ts";
import type { Presences } from "../../board/index.ts";
import type { WebhookCommand } from "../../webhook-commands/index.ts";
import { mentionOptionOf } from "./mention-option.ts";
import { usePresences } from "./use-presence.ts";

const NONE = 0;
const SIGN = 1;
const MENTIONS = "Mention suggestions";
const COMMANDS = "Command suggestions";

interface SuggestionsOf {
  readonly draft: Draft;
  readonly suggestions: readonly Identity[];
  readonly commands: readonly Command[];
  readonly webhookCommands: readonly WebhookCommand[];
}

interface Shown {
  readonly label: string;
  readonly options: readonly MentionOption[];
  readonly onChoose: (option: string) => void;
}

interface Handlers {
  readonly mention: (option: string) => void;
  readonly command: (option: string) => void;
}

interface Named {
  readonly name: string;
  readonly description?: string;
}

function slashOption(named: Named): MentionOption {
  return {
    detail: named.description ?? null,
    identity: null,
    option: `/${named.name}`,
    presence: null,
    spoken: `/${named.name}`,
  };
}

function shownFor(
  { commands, webhookCommands, suggestions }: SuggestionsOf,
  handlers: Handlers,
  presences: Presences,
): Shown {
  if (commands.length + webhookCommands.length > NONE) {
    const options = [...commands, ...webhookCommands].map((named) => slashOption(named));
    return { label: COMMANDS, onChoose: handlers.command, options };
  }
  const options = suggestions.map((identity) => mentionOptionOf({ identity, presences }));
  return { label: MENTIONS, onChoose: handlers.mention, options };
}

function useSuggestions(of: SuggestionsOf): Shown {
  const { commands, draft, suggestions, webhookCommands } = of;
  const mention = useCallback(
    (option: string) => {
      draft.choose(option.slice(SIGN));
    },
    [draft],
  );
  const command = useCallback(
    (option: string) => {
      const name = option.slice(SIGN);
      if (commands.some((listed) => listed.name === name)) {
        draft.pickCommand(name);
        return;
      }
      draft.pickWebhookCommand(name);
    },
    [commands, draft],
  );
  const presences = usePresences();
  return useMemo(
    () => shownFor({ commands, draft, suggestions, webhookCommands }, { command, mention }, presences),
    [command, commands, draft, mention, presences, suggestions, webhookCommands],
  );
}

export { useSuggestions };
