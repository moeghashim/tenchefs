import type { Act, Action, Keymap } from "../../keymap/index.ts";
import { THREAD_PANEL } from "./thread-panel.ts";

const MESSAGE = "article";
const PANEL = `aside[aria-label="${THREAD_PANEL.thread}"]`;
const PANEL_PARENT = `${PANEL} article[aria-label="${THREAD_PANEL.parent}"]`;
const PANEL_REPLY_BOX = `${PANEL} textarea`;
const PANEL_CLOSE = `${PANEL} > header a[href]`;
const CHANNEL_MESSAGE = `main [role="feed"] ${MESSAGE}[aria-current="true"]`;

interface Pressing {
  readonly keymap: Keymap;
  readonly action: Action;
  readonly whenOpen: string;
}

function focused(selector: string): boolean {
  const element = globalThis.document.querySelector<HTMLElement>(selector);
  if (element === null) {
    return false;
  }
  element.focus();
  return true;
}

function controlFor(target: EventTarget | null, keys: string): HTMLElement | null {
  if (!(target instanceof HTMLElement) || !target.matches(MESSAGE)) {
    return null;
  }
  return target.querySelector<HTMLElement>(`[aria-keyshortcuts="${keys}"]`);
}

function click(keymap: Keymap, action: Action): Act {
  return ({ target }) => {
    const control = controlFor(target, keymap.shortcutOf(action).keys);
    if (control === null) {
      return false;
    }
    control.click();
    return true;
  };
}

function press({ action, keymap, whenOpen }: Pressing): Act {
  return ({ target }) => {
    const control = controlFor(target, keymap.shortcutOf(action).keys);
    if (control === null) {
      return false;
    }
    if (control instanceof HTMLAnchorElement && control.hash === globalThis.location.hash) {
      return focused(whenOpen);
    }
    control.click();
    return true;
  };
}

function inPanel(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches(MESSAGE) && target.closest(PANEL) !== null;
}

function backToChannel({ target }: KeyboardEvent): boolean {
  return inPanel(target) && focused(CHANNEL_MESSAGE);
}

function threadPanel(): Element | null {
  return globalThis.document.querySelector(PANEL);
}

function closedTo(hash: string): boolean {
  focused(CHANNEL_MESSAGE);
  globalThis.location.hash = hash;
  return true;
}

function closeThread(): boolean {
  const close = globalThis.document.querySelector<HTMLAnchorElement>(PANEL_CLOSE);
  return close !== null && closedTo(close.hash);
}

type MessageAction =
  | "backToChannel"
  | "copyMessageLink"
  | "markUnread"
  | "openThread"
  | "replyToMessage"
  | "toggleThreadClosed"
  | "toggleThumbsDown"
  | "toggleThumbsUp";

function messageActions(keymap: Keymap): Readonly<Record<MessageAction, Act>> {
  return {
    backToChannel,
    copyMessageLink: click(keymap, "copyMessageLink"),
    markUnread: click(keymap, "markUnread"),
    openThread: press({ action: "openThread", keymap, whenOpen: PANEL_PARENT }),
    replyToMessage: press({ action: "replyToMessage", keymap, whenOpen: PANEL_REPLY_BOX }),
    toggleThreadClosed: click(keymap, "toggleThreadClosed"),
    toggleThumbsDown: click(keymap, "toggleThumbsDown"),
    toggleThumbsUp: click(keymap, "toggleThumbsUp"),
  };
}

export { closeThread, messageActions, threadPanel };
