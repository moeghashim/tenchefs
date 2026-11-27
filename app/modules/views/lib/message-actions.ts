import type { MenuChoice, MessageActionRegistry } from "../../design-system/messages.tsx";
import { createContext } from "react";

interface MessageActions extends MessageActionRegistry {
  readonly choiceOf: (message: unknown, keys: string) => MenuChoice | null;
}

const NO_CHOICES: readonly MenuChoice[] = [];

function keyed(keys: string): (choice: MenuChoice) => boolean {
  return ({ keys: shortcut }) => shortcut.keys === keys;
}

function createMessageActions(): MessageActions {
  const offered = new Map<unknown, readonly MenuChoice[]>();
  return {
    choiceOf: (message, keys) => (offered.get(message) ?? NO_CHOICES).find(keyed(keys)) ?? null,
    offer: (message, choices) => offered.set(message, choices),
    withdraw: (message) => offered.delete(message),
  };
}

const MessageChoices = createContext<MessageActions>(createMessageActions());

export { MessageChoices, createMessageActions };
export type { MessageActions };
