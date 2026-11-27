import type { Act } from "../../keymap/index.ts";
import { locationOf } from "../../paths/index.ts";

const SIDEBAR_LINK = 'nav[aria-label="Sidebar"] a[href]';
const OPEN_LINK = `${SIDEBAR_LINK}[aria-current="page"]`;
const FEED = '[role="feed"]';
const MESSAGE = "article";
const SELECTED = `${MESSAGE}[aria-current="true"]`;
const ROW = "a[data-feed-row]";
const SELECTED_ROW = `${ROW}[aria-current="page"]`;
const BOX = 'textarea[name="text"]';
const PANEL = "aside";
const CONVERSATION = 'aside[aria-label="Conversation"]';
const MESSAGE_OR_ITS_LINK = `${MESSAGE}, ${MESSAGE} a[href]`;
const LAST = -1;

type ColumnAction = "backToRow" | "intoMessageBox" | "intoMessages" | "toSidebar";

interface ColumnKeys {
  readonly watch: (target: () => unknown) => void;
}

function focusedOn(element: unknown): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  element.focus();
  return globalThis.document.activeElement === element;
}

function channelFeed(): HTMLElement | null {
  for (const feed of globalThis.document.querySelectorAll<HTMLElement>(`main ${FEED}`)) {
    if (feed.closest(PANEL) === null) {
      return feed;
    }
  }
  return null;
}

function holds(around: unknown, element: unknown): boolean {
  return around instanceof Node && element instanceof Node && around.contains(element);
}

function isMessage(target: unknown): target is HTMLElement {
  return target instanceof HTMLElement && target.matches(MESSAGE);
}

function inChannelFeed(target: unknown): boolean {
  return isMessage(target) && holds(channelFeed(), target);
}

function rowOutsidePanel(selector: string): HTMLElement | null {
  for (const row of globalThis.document.querySelectorAll<HTMLElement>(`main ${selector}`)) {
    if (row.closest(PANEL) === null) {
      return row;
    }
  }
  return null;
}

function isRow(target: unknown): target is HTMLElement {
  return target instanceof HTMLElement && target.matches(`main ${ROW}`) && target.closest(PANEL) === null;
}

function toSidebar({ target }: KeyboardEvent): boolean {
  return (inChannelFeed(target) || isRow(target)) && focusedOn(globalThis.document.querySelector(OPEN_LINK));
}

function chosen(): unknown {
  const feed = channelFeed();
  if (feed === null) {
    return null;
  }
  return feed.querySelector(SELECTED) ?? [...feed.querySelectorAll(MESSAGE)].at(LAST);
}

function newestIn(channel: string): unknown {
  const label = `[aria-label="${CSS.escape(`Messages in #${channel}`)}"]`;
  const feed = channelFeed();
  if (!(feed instanceof Element) || feed.closest(label) === null) {
    return null;
  }
  return [...feed.querySelectorAll(MESSAGE)].at(LAST);
}

function chosenRow(): unknown {
  return rowOutsidePanel(SELECTED_ROW) ?? rowOutsidePanel(ROW);
}

function inConversation(target: unknown): boolean {
  return target instanceof HTMLElement && target.matches(MESSAGE_OR_ITS_LINK) && target.closest(CONVERSATION) !== null;
}

function backToRow({ target }: KeyboardEvent): boolean {
  return inConversation(target) && focusedOn(chosenRow());
}

interface Link {
  readonly link: HTMLAnchorElement;
  readonly chosen: () => unknown;
  readonly newest: () => unknown;
}

function linkOf(target: unknown): Link | null {
  if (!(target instanceof HTMLAnchorElement) || !target.matches(SIDEBAR_LINK)) {
    return null;
  }
  const { route } = locationOf(target.hash);
  if (route.name === "inbox") {
    return { chosen: chosenRow, link: target, newest: chosenRow };
  }
  if (route.name !== "channel") {
    return null;
  }
  return { chosen, link: target, newest: () => newestIn(route.channel) };
}

function intoMessages(keys: ColumnKeys): Act {
  return ({ target }) => {
    const found = linkOf(target);
    if (found === null) {
      return false;
    }
    const { link, newest } = found;
    if (link.matches(OPEN_LINK)) {
      return focusedOn(found.chosen());
    }
    link.blur();
    globalThis.location.hash = link.hash;
    keys.watch(newest);
    return true;
  };
}

function outsidePanel(element: unknown): boolean {
  return element instanceof Element && element.closest(PANEL) === null;
}

function channelBox(): unknown {
  for (const box of globalThis.document.querySelectorAll(`main ${BOX}`)) {
    if (outsidePanel(box)) {
      return box;
    }
  }
  return null;
}

function newestOf(around: unknown): unknown {
  if (!(around instanceof Element)) {
    return null;
  }
  return [...around.querySelectorAll(MESSAGE)].at(LAST);
}

function intoMessageBox({ target }: KeyboardEvent): boolean {
  if (!isMessage(target)) {
    return false;
  }
  const panel = target.closest(PANEL);
  if (panel === null) {
    return newestOf(channelFeed()) === target && focusedOn(channelBox());
  }
  return newestOf(panel) === target && focusedOn(panel.querySelector(BOX));
}

function columnActions(keys: Readonly<ColumnKeys>): Readonly<Record<ColumnAction, Act>> {
  return { backToRow, intoMessageBox, intoMessages: intoMessages(keys), toSidebar };
}

export { columnActions };
