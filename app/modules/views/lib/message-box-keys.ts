import type { Act } from "../../keymap/index.ts";

const BOX = 'textarea[name="text"]';
const MESSAGE = "article";
const LAST = -1;
const FIRST_CHARACTER = 0;

interface MessageBoxKeys {
  readonly remember: (target: unknown, relatedTarget: unknown) => void;
  readonly actions: Readonly<Record<"leaveTextBox" | "newestMessage", Act>>;
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
