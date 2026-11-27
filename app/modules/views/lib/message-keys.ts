import type { Act, Action, Keymap } from "../../keymap/index.ts";
import type { MenuChoice } from "../../design-system/messages.tsx";
import type { MessageActions } from "./message-actions.ts";
import { THREAD_PANEL } from "./thread-panel.ts";

const MESSAGE = "article";
const PANEL = `aside[aria-label="${THREAD_PANEL.thread}"]`;
const PANEL_PARENT = `${PANEL} article[aria-label="${THREAD_PANEL.parent}"]`;
const PANEL_REPLY_BOX = `${PANEL} textarea`;
const PANEL_CLOSE = `${PANEL} > header a[href]`;
const CHANNEL_FEED = 'main [role="feed"]';
const OPEN_MESSAGE = `${MESSAGE}[aria-current="true"]`;
const FOLD = "[data-closed-fold]";
const NOT_A_FOLD = `${MESSAGE}:not(${FOLD})`;
const OPEN_FOLD = `${MESSAGE}${FOLD}[aria-current="true"]`;
const NEXT = 1;
const LAST = -1;

function focused(selector: string): boolean {
  const element = globalThis.document.querySelector<HTMLElement>(selector);
  if (element === null) {
    return false;
  }
  element.focus();
  return true;
}

type MessageOf = (target: EventTarget | null) => Element | null;

interface Clicking {
  readonly keymap: Keymap;
  readonly action: Action;
}

interface Choosing extends Clicking {
  readonly actions: MessageActions;
  readonly messageOf: MessageOf;
}

interface Pressing extends Choosing {
  readonly whenOpen: string;
}

function focusedMessage(target: EventTarget | null): Element | null {
  if (!(target instanceof HTMLElement) || !target.matches(MESSAGE)) {
    return null;
  }
  return target;
}

function click({ action, keymap }: Clicking): Act {
  return ({ target }) => {
    const found = focusedMessage(target);
    if (found === null) {
      return false;
    }
    const control = found.querySelector<HTMLElement>(`[aria-keyshortcuts="${keymap.shortcutOf(action).keys}"]`);
    if (control === null) {
      return false;
    }
    control.click();
    return true;
  };
}

function choiceFor({ action, actions, keymap, messageOf }: Choosing, target: EventTarget | null): MenuChoice | null {
  const message = messageOf(target);
  if (message === null) {
    return null;
  }
  return actions.choiceOf(message, keymap.shortcutOf(action).keys);
}

function hashOf(href: string): string {
  return new URL(href, globalThis.location.href).hash;
}

function made(choice: MenuChoice): void {
  if (choice.href === null) {
    choice.onSelect();
    return;
  }
  if (choice.onSelect !== null) {
    choice.onSelect();
  }
  globalThis.location.hash = hashOf(choice.href);
}

function chooseOn(choosing: Choosing): Act {
  return ({ target }) => {
    const choice = choiceFor(choosing, target);
    if (choice === null) {
      return false;
    }
    made(choice);
    return true;
  };
}

function press(pressing: Pressing): Act {
  return ({ target }) => {
    const choice = choiceFor(pressing, target);
    if (choice === null) {
      return false;
    }
    const again = choice.href !== null && hashOf(choice.href) === globalThis.location.hash;
    made(choice);
    return !again || focused(pressing.whenOpen);
  };
}

function channelFeed(): Element | null {
  for (const feed of globalThis.document.querySelectorAll(CHANNEL_FEED)) {
    if (feed.closest(PANEL) === null) {
      return feed;
    }
  }
  return null;
}

function inChannel(selector: string): readonly HTMLElement[] {
  const feed = channelFeed();
  if (feed === null) {
    return [];
  }
  return [...feed.querySelectorAll<HTMLElement>(selector)];
}

function focusedOn(message: unknown): boolean {
  if (!(message instanceof HTMLElement)) {
    return false;
  }
  message.focus();
  return true;
}

function besideOpenFold(): HTMLElement | null {
  const [fold = null] = inChannel(OPEN_FOLD);
  const items: readonly (HTMLElement | null)[] = inChannel(MESSAGE);
  const folds: readonly (HTMLElement | null)[] = inChannel(`${MESSAGE}${FOLD}`);
  const passed = items.indexOf(fold) - folds.indexOf(fold);
  const messages = inChannel(NOT_A_FOLD);
  return messages[passed] ?? messages[passed - NEXT] ?? fold;
}

function openInChannel(): HTMLElement | null {
  const [open = null] = inChannel(OPEN_MESSAGE);
  if (open === null || !open.matches(FOLD)) {
    return open;
  }
  return besideOpenFold();
}

function olderButtonOf(feed: unknown): HTMLButtonElement | null {
  if (!(feed instanceof HTMLElement) || feed.id === "" || !feed.isConnected) {
    return null;
  }
  return globalThis.document.querySelector<HTMLButtonElement>(`button[aria-controls="${CSS.escape(feed.id)}"]`);
}

interface Paging {
  readonly feed: unknown;
  readonly from: unknown;
}

function pagedBack({ feed, from }: Paging): boolean {
  if (globalThis.document.activeElement !== from || focusedOn(openInChannel())) {
    return true;
  }
  const older = olderButtonOf(feed);
  if (older === null) {
    return true;
  }
  if (!older.disabled) {
    older.click();
  }
  return false;
}

function pageBackTo(feed: unknown): void {
  const paging = { feed, from: globalThis.document.activeElement };
  const watch = new MutationObserver(() => {
    if (pagedBack(paging)) {
      watch.disconnect();
    }
  });
  watch.observe(globalThis.document.body, { attributes: true, childList: true, subtree: true });
}

function focusedOnChannelMessage(): boolean {
  if (focusedOn(openInChannel())) {
    return true;
  }
  const feed = channelFeed();
  const older = olderButtonOf(feed);
  if (older === null) {
    return false;
  }
  pageBackTo(feed);
  older.click();
  return true;
}

const MESSAGE_OR_ITS_LINK = `${MESSAGE}, ${MESSAGE} a[href]`;

function inPanel(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches(MESSAGE_OR_ITS_LINK) && target.closest(PANEL) !== null;
}

function backToChannel({ target }: KeyboardEvent): boolean {
  return inPanel(target) && focusedOnChannelMessage();
}

function threadPanel(): Element | null {
  return globalThis.document.querySelector(PANEL);
}

function closedTo(hash: string): boolean {
  focusedOn(openInChannel() ?? inChannel(NOT_A_FOLD).at(LAST));
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
  | "copyMessageText"
  | "deleteMessage"
  | "markUnread"
  | "openThread"
  | "replyToMessage"
  | "toggleThreadClosed"
  | "toggleThumbsDown"
  | "toggleThumbsUp"
  | "unfoldMessage";

interface MessageKeysOf {
  readonly keymap: Keymap;
  readonly actions: MessageActions;
}

function messageActions({ actions, keymap }: MessageKeysOf): Readonly<Record<MessageAction, Act>> {
  function choose(action: Action): Act {
    return chooseOn({ action, actions, keymap, messageOf: focusedMessage });
  }
  return {
    backToChannel,
    copyMessageLink: choose("copyMessageLink"),
    copyMessageText: choose("copyMessageText"),
    deleteMessage: choose("deleteMessage"),
    markUnread: choose("markUnread"),
    openThread: press({ action: "openThread", actions, keymap, messageOf: focusedMessage, whenOpen: PANEL_PARENT }),
    replyToMessage: press({
      action: "replyToMessage",
      actions,
      keymap,
      messageOf: focusedMessage,
      whenOpen: PANEL_REPLY_BOX,
    }),
    toggleThreadClosed: choose("toggleThreadClosed"),
    toggleThumbsDown: choose("toggleThumbsDown"),
    toggleThumbsUp: choose("toggleThumbsUp"),
    unfoldMessage: click({ action: "unfoldMessage", keymap }),
  };
}

export { chooseOn, closeThread, focusedOnChannelMessage, messageActions, threadPanel };
export type { MessageKeysOf };
