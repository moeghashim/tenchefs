import { isOnPage, placesAfter, placesNow } from "./focus-places.ts";

const LANDING_KEYS: ReadonlySet<string> = new Set([
  " ",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Enter",
  "Escape",
  "j",
  "k",
]);
const ROW = "a[data-feed-row]";
const LIST = 'aside, nav, main, form, dialog, [role="dialog"], [role="alertdialog"]';
const DIALOG = 'dialog, [role="dialog"], [role="alertdialog"]';
const FOCUSABLE = "a[href], button:enabled, input:enabled, select:enabled, textarea:enabled, [tabindex]";
const DISABLED = "disabled";
const WATCHED = { attributeFilter: [DISABLED], childList: true, subtree: true };
const AFTER_THE_APP = 0;
const NEXT = 1;
const FIRST = 0;

interface Held {
  readonly element: unknown;
  readonly peers: readonly unknown[];
  readonly places: readonly unknown[];
}

interface Landing {
  readonly isLanding: () => boolean;
}

interface FocusKeeper {
  readonly landsOn: (event: unknown) => boolean;
  readonly stop: () => void;
}

interface Cell<Value> {
  readonly get: () => Value;
  readonly set: (value: Value) => void;
}

interface Disabled {
  readonly blurred: (lost: Held) => void;
  readonly changed: (keeper: Keeper) => void;
  readonly focused: () => void;
}

interface Keeper {
  readonly beneath: Cell<Held | null>;
  readonly disabled: Disabled;
  readonly held: Cell<Held | null>;
  readonly landing: Landing;
}

interface Handlers {
  readonly changed: () => void;
  readonly focused: (event: unknown) => void;
  readonly blurred: (event: unknown) => void;
}

function isDisabled(element: unknown): boolean {
  return element instanceof HTMLElement && element.matches(":disabled");
}

function isOnNothing(target: unknown): boolean {
  return target === null || target === globalThis.document.body;
}

function isLost(): boolean {
  return isOnNothing(globalThis.document.activeElement);
}

function focusedOn(element: unknown): boolean {
  if (!isOnPage(element)) {
    return false;
  }
  element.focus();
  return globalThis.document.activeElement === element;
}

function listOf(element: unknown): Element {
  const { body } = globalThis.document;
  if (element instanceof Element && element.parentElement !== null) {
    return element.parentElement.closest(LIST) ?? body;
  }
  return body;
}

function kindOf(element: unknown): string {
  if (element instanceof Element && !element.matches(ROW)) {
    return element.tagName.toLowerCase();
  }
  return ROW;
}

function isPeer(each: unknown, list: unknown): boolean {
  return listOf(each) === list && each instanceof Element && each.matches(FOCUSABLE);
}

function peersOf(element: unknown): readonly unknown[] {
  const list = listOf(element);
  const peers: unknown[] = [];
  for (const each of list.querySelectorAll(kindOf(element))) {
    if (each === element || isPeer(each, list)) {
      peers.push(each);
    }
  }
  return peers;
}

function heldOf(element: unknown): Held {
  return { element, peers: peersOf(element), places: placesNow() };
}

function neighboursOf({ element, peers }: Held): readonly unknown[] {
  const at = peers.indexOf(element);
  return [...peers.slice(at + NEXT), ...peers.slice(FIRST, Math.max(at, FIRST)).toReversed()];
}

function inDialog(element: unknown): boolean {
  return element instanceof Element && element.closest(DIALOG) !== null;
}

function beneathAfter(beneath: Held | null, was: Held | null, now: Held): Held | null {
  if (!inDialog(now.element)) {
    return null;
  }
  if (was !== null && !inDialog(was.element)) {
    return was;
  }
  return beneath;
}

function under(beneath: Held | null): readonly unknown[] {
  if (beneath === null) {
    return [];
  }
  return [beneath.element, ...neighboursOf(beneath)];
}

function isPlain(event: Readonly<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">>): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function isLandingKey(event: unknown): boolean {
  return event instanceof KeyboardEvent && LANDING_KEYS.has(event.key) && isPlain(event) && isOnNothing(event.target);
}

function isLostFrom(event: unknown, element: unknown): boolean {
  return event instanceof FocusEvent && event.target === element && event.relatedTarget === null;
}

function listening(handlers: Handlers): () => void {
  const { document } = globalThis;
  const observer = new MutationObserver(handlers.changed);
  observer.observe(document.body, WATCHED);
  document.addEventListener("focusin", handlers.focused);
  document.addEventListener("focusout", handlers.blurred);
  return () => {
    observer.disconnect();
    document.removeEventListener("focusin", handlers.focused);
    document.removeEventListener("focusout", handlers.blurred);
  };
}

function cellOf<Value>(value: Value): Cell<Value> {
  let now = value;
  return {
    get: () => now,
    set: (next) => {
      now = next;
    },
  };
}

function recover(keeper: Keeper, lost: Held): void {
  if (keeper.held.get() === lost && isLost() && !keeper.landing.isLanding()) {
    keeper.held.set(null);
    [...neighboursOf(lost), ...under(keeper.beneath.get()), ...placesAfter(lost.places)].some((place) =>
      focusedOn(place),
    );
  }
}

function goneFrom(keeper: Keeper, lost: Held): void {
  if (keeper.held.get() === lost && !isOnPage(lost.element)) {
    globalThis.setTimeout(recover, AFTER_THE_APP, keeper, lost);
  }
}

function disabledWatch(): Disabled {
  const disabled = cellOf<Held | null>(null);
  function enabledAgain(keeper: Keeper, lost: Held): void {
    if (!isOnPage(lost.element)) {
      disabled.set(null);
      keeper.held.set(lost);
      goneFrom(keeper, lost);
    } else if (!isDisabled(lost.element)) {
      disabled.set(null);
      focusedOn(lost.element);
    }
  }
  return {
    blurred: (lost) => {
      if (isDisabled(lost.element)) {
        disabled.set(lost);
      }
    },
    changed: (keeper) => {
      const lost = disabled.get();
      if (lost !== null) {
        enabledAgain(keeper, lost);
      }
    },
    focused: () => {
      disabled.set(null);
    },
  };
}

function blurredOf(keeper: Keeper): Handlers["blurred"] {
  return (event) => {
    const was = keeper.held.get();
    if (was !== null && isLostFrom(event, was.element)) {
      queueMicrotask(() => {
        if (!isOnPage(was.element)) {
          goneFrom(keeper, was);
        } else if (keeper.held.get() === was) {
          keeper.held.set(null);
          keeper.disabled.blurred(was);
        }
      });
    }
  };
}

function changedOf(keeper: Keeper): Handlers["changed"] {
  return () => {
    keeper.disabled.changed(keeper);
    const held = keeper.held.get();
    if (held === null) {
      return;
    }
    if (held.element === globalThis.document.activeElement) {
      keeper.held.set(heldOf(held.element));
    } else {
      goneFrom(keeper, held);
    }
  };
}

function focusedOf(keeper: Keeper, last: Cell<unknown>): Handlers["focused"] {
  return (event) => {
    keeper.disabled.focused();
    if (event instanceof FocusEvent && event.target instanceof HTMLElement) {
      last.set(event.target);
      const now = heldOf(event.target);
      keeper.beneath.set(beneathAfter(keeper.beneath.get(), keeper.held.get(), now));
      keeper.held.set(now);
    }
  };
}

function createFocusKeeper(landing: Landing): FocusKeeper {
  const last = cellOf<unknown>(null);
  const keeper: Keeper = {
    beneath: cellOf<Held | null>(null),
    disabled: disabledWatch(),
    held: cellOf<Held | null>(null),
    landing,
  };
  const stop = listening({ blurred: blurredOf(keeper), changed: changedOf(keeper), focused: focusedOf(keeper, last) });
  return {
    landsOn: (event) => isLandingKey(event) && [last.get(), ...placesNow()].some((place) => focusedOn(place)),
    stop,
  };
}

export { type FocusKeeper, type Landing, createFocusKeeper };
