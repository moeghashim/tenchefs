import type { MenuChoice } from "./menu-parts.ts";
import { createContext } from "react";

interface MessageActionRegistry {
  readonly offer: (message: unknown, choices: readonly MenuChoice[]) => unknown;
  readonly withdraw: (message: unknown) => unknown;
}

const UNHEARD: MessageActionRegistry = { offer: Boolean, withdraw: Boolean };

const MessageActions = createContext<MessageActionRegistry>(UNHEARD);

export { MessageActions };
export type { MessageActionRegistry };
