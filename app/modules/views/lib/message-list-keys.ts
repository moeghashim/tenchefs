import type { Act } from "../../keymap/index.ts";
import { THREAD_PANEL } from "./thread-panel.ts";

const FEED = '[role="feed"]';
const ITEM = "article";
const FOLD = "article[data-closed-fold]";
const THREAD = `aside[aria-label="${THREAD_PANEL.thread}"]`;
const TOP = `${ITEM}[aria-label="${THREAD_PANEL.parent}"]`;
const UNKNOWN_SIZE = "-1";
const FIRST = 0;
const STEP = 1;
const NOT_FOUND = -1;

type Move = "first" | "last" | "next" | "previous";

interface List {
  readonly list: HTMLElement;
  readonly items: readonly HTMLElement[];
}

interface Place extends List {
  readonly at: number;
}

function threadAround(): HTMLElement | null {
  const focused = globalThis.document.activeElement;
  if (!(focused instanceof HTMLElement) || focused.closest(`${TOP}, ${FEED}`) === null) {
    return null;
  }
  return focused.closest<HTMLElement>(THREAD);
}

function threadList(): List | null {
  const thread = threadAround();
  if (thread === null) {
    return null;
  }
  return { items: [...thread.querySelectorAll<HTMLElement>(`${TOP}, ${FEED} ${ITEM}`)], list: thread };
}

function listOf(): List | null {
  const feed = globalThis.document.querySelector<HTMLElement>(`${FEED}:focus-within`);
  if (feed === null) {
    return null;
  }
  return { items: [...feed.querySelectorAll<HTMLElement>(ITEM)], list: feed };
}

function placeOf(): Place | null {
  const list = threadList() ?? listOf();
  if (list === null) {
    return null;
  }
  const { items } = list;
  let at = NOT_FOUND;
  for (const [index, item] of items.entries()) {
    if (item.matches(":focus-within")) {
      at = index;
    }
  }
  return { at, items, list: list.list };
}

function indexAfter(move: Move, at: number, count: number): number {
  if (move === "first") {
    return FIRST;
  }
  if (move === "last") {
    return count - STEP;
  }
  if (move === "next") {
    return at + STEP;
  }
  return at - STEP;
}

function olderButtonOf(): HTMLButtonElement | null {
  const place = placeOf();
  if (
    place === null ||
    place.list.id === "" ||
    place.list.querySelector(`${ITEM}[aria-setsize="${UNKNOWN_SIZE}"]`) === null
  ) {
    return null;
  }
  return globalThis.document.querySelector<HTMLButtonElement>(`button[aria-controls="${place.list.id}"]:enabled`);
}

function loadOlder(move: Move): void {
  const older = olderButtonOf();
  if (move === "previous" && older !== null) {
    older.click();
  }
}

function moving(move: Move): Act {
  return () => {
    const place = placeOf();
    if (place === null) {
      return false;
    }
    const item = place.items[indexAfter(move, place.at, place.items.length)] ?? null;
    if (item === null) {
      loadOlder(move);
    } else {
      item.focus();
    }
    return true;
  };
}

function unfold({ target }: KeyboardEvent): boolean {
  if (!(target instanceof HTMLElement) || !target.matches(FOLD) || target.closest(FEED) === null) {
    return false;
  }
  for (const button of target.querySelectorAll("button")) {
    button.click();
  }
  return true;
}

const MESSAGE_LIST_ACTIONS = {
  firstMessage: moving("first"),
  lastMessage: moving("last"),
  nextMessage: moving("next"),
  previousMessage: moving("previous"),
  unfoldClosed: unfold,
} as const satisfies Readonly<Record<string, Act>>;

export { MESSAGE_LIST_ACTIONS };
