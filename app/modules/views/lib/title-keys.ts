import type { Act, Action } from "../../keymap/index.ts";
import type { MessageKeysOf } from "./message-keys.ts";
import { THREAD_PANEL } from "./thread-panel.ts";
import { chooseOn } from "./message-keys.ts";

const PANEL_TITLE = `aside[aria-label="${THREAD_PANEL.thread}"] > header h2`;

type ThreadTitleAction = "copyMessageLink" | "markUnread" | "toggleThreadClosed";

function panelTitle(target: EventTarget | null): Element | null {
  if (!(target instanceof HTMLElement) || !target.matches(PANEL_TITLE)) {
    return null;
  }
  return target;
}

function boxForm(target: EventTarget | null): Element | null {
  if (!(target instanceof HTMLTextAreaElement)) {
    return null;
  }
  return target.closest("form");
}

function scheduleMessage({ actions, keymap }: MessageKeysOf): Act {
  return chooseOn({ action: "scheduleMessage", actions, keymap, messageOf: boxForm });
}

function threadTitleActions({ actions, keymap }: MessageKeysOf): Readonly<Record<ThreadTitleAction, Act>> {
  function choose(action: Action): Act {
    return chooseOn({ action, actions, keymap, messageOf: panelTitle });
  }
  return {
    copyMessageLink: choose("copyMessageLink"),
    markUnread: choose("markUnread"),
    toggleThreadClosed: choose("toggleThreadClosed"),
  };
}

export { scheduleMessage, threadTitleActions };
