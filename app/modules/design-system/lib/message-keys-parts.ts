import type { Shortcut } from "./shortcut.ts";
import { createContext } from "react";

interface MessageShortcuts {
  readonly reply: Shortcut;
  readonly openThread: Shortcut;
  readonly markUnread: Shortcut;
  readonly copyLink: Shortcut;
  readonly delete: Shortcut;
  readonly thread: Shortcut;
  readonly unfold: Shortcut;
}

const NO_SHORTCUT: Shortcut = { keys: "", label: "" };

const MessageKeys = createContext<MessageShortcuts>({
  copyLink: NO_SHORTCUT,
  delete: NO_SHORTCUT,
  markUnread: NO_SHORTCUT,
  openThread: NO_SHORTCUT,
  reply: NO_SHORTCUT,
  thread: NO_SHORTCUT,
  unfold: NO_SHORTCUT,
});

export { MessageKeys };
export type { MessageShortcuts };
