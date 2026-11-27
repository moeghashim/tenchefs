import type { Shortcut } from "./shortcut.ts";
import { createContext } from "react";

interface MessageShortcuts {
  readonly reply: Shortcut;
  readonly openThread: Shortcut;
  readonly markUnread: Shortcut;
  readonly copyLink: Shortcut;
  readonly copyText: Shortcut;
  readonly delete: Shortcut;
  readonly thread: Shortcut;
  readonly thumbsUp: Shortcut;
  readonly thumbsDown: Shortcut;
  readonly schedule: Shortcut;
  readonly unfold: Shortcut;
  readonly previousImage: Shortcut;
  readonly nextImage: Shortcut;
  readonly attach: Shortcut;
}

const NO_SHORTCUT: Shortcut = { keys: "", label: "" };

const MessageKeys = createContext<MessageShortcuts>({
  attach: NO_SHORTCUT,
  copyLink: NO_SHORTCUT,
  copyText: NO_SHORTCUT,
  delete: NO_SHORTCUT,
  markUnread: NO_SHORTCUT,
  nextImage: NO_SHORTCUT,
  openThread: NO_SHORTCUT,
  previousImage: NO_SHORTCUT,
  reply: NO_SHORTCUT,
  schedule: NO_SHORTCUT,
  thread: NO_SHORTCUT,
  thumbsDown: NO_SHORTCUT,
  thumbsUp: NO_SHORTCUT,
  unfold: NO_SHORTCUT,
});

export { MessageKeys };
export type { MessageShortcuts };
