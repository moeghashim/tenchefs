import type { Act } from "../../keymap/index.ts";
import { focusedOnChannelMessage } from "./message-keys.ts";

const BOX = 'textarea[name="text"]';
const MESSAGE = "article";
const LAST = -1;
const FIRST_CHARACTER = 0;
const THREAD = 'aside[aria-label="Thread"]';
const PANEL = "aside";
const OPEN_LINK = 'nav[aria-label="Sidebar"] a[href][aria-current="page"]';
const ROW = "main a[data-feed-row]";
const SELECTED_ROW = `${ROW}[aria-current="page"]`;

interface MessageBoxKeys {
  readonly remember: (target: unknown, relatedTarget: unknown) => void;
  readonly actions: Readonly<Record<"leaveTextBox" | "newestMessage" | "toLeftColumn", Act>>;
}

function boxOf(target: unknown): HTMLTextAreaElement | null {
  if (target instanceof HTMLTextAreaElement && target.matches(BOX)) {
    return target;
  }
  return null;
}

function boxAtFirstCharacter(target: unknown): HTMLTextAreaElement | null {
  const box = boxOf(target);
  if (box === null || box.selectionStart !== FIRST_CHARACTER || box.selectionEnd !== FIRST_CHARACTER) {
    return null;
  }
  return box;
}

function newestNear(box: unknown): unknown {
  if (!(box instanceof HTMLElement)) {
    return null;
  }
  for (let around = box.parentElement; around !== null; around = around.parentElement) {
    const newest = [...around.querySelectorAll<HTMLElement>(MESSAGE)].at(LAST) ?? null;
    if (newest !== null) {
      return newest;
    }
  }
  return null;
}

function focusedOn(element: unknown): boolean {
  if (!(element instanceof HTMLElement) || !element.isConnected) {
    return false;
  }
  element.focus();
  return globalThis.document.activeElement === element;
}

function rowOutsidePanel(selector: string): HTMLElement | null {
  for (const row of globalThis.document.querySelectorAll<HTMLElement>(selector)) {
    if (row.closest(PANEL) === null) {
      return row;
    }
  }
  return null;
}

function leftOf(box: unknown): boolean {
  if (!(box instanceof Element)) {
    return false;
  }
  if (box.closest(THREAD) !== null) {
    return focusedOnChannelMessage();
  }
  if (box.closest(PANEL) !== null) {
    return focusedOn(rowOutsidePanel(SELECTED_ROW) ?? rowOutsidePanel(ROW));
  }
  return focusedOn(globalThis.document.querySelector(OPEN_LINK));
}

function toLeftColumn({ target }: KeyboardEvent): boolean {
  return leftOf(boxAtFirstCharacter(target));
}

function placeOf(element: unknown): unknown {
  if (!(element instanceof HTMLElement)) {
    return null;
  }
  return element.closest(MESSAGE) ?? element;
}

function createMessageBoxKeys(): MessageBoxKeys {
  const before = new WeakMap<HTMLElement, HTMLElement>();
  return {
    actions: {
      leaveTextBox: ({ target }) => {
        const box = boxOf(target);
        if (box === null) {
          return false;
        }
        box.blur();
        if (!focusedOn(before.get(box))) {
          focusedOn(newestNear(box));
        }
        return true;
      },
      newestMessage: ({ target }) => focusedOn(newestNear(boxAtFirstCharacter(target))),
      toLeftColumn,
    },
    remember: (target, relatedTarget) => {
      const box = boxOf(target);
      if (box === null) {
        return;
      }
      const place = placeOf(relatedTarget);
      if (place instanceof HTMLElement) {
        before.set(box, place);
      } else {
        before.delete(box);
      }
    },
  };
}

export { createMessageBoxKeys };
