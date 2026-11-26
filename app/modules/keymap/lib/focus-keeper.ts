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
const PANEL = 'main aside[aria-label="Thread"]';
const PANEL_MESSAGES = `${PANEL} article`;
const PANEL_SELECTED = `${PANEL} article[aria-current="true"]`;
const FEED_MESSAGES = 'main [role="feed"] article';
const FEED_SELECTED = 'main [role="feed"] article[aria-current="true"]';
const ROW = "a[data-feed-row]";
const ROWS = `main ${ROW}`;
const SELECTED_ROW = `main ${ROW}[aria-current="page"]`;
const SIDEBAR_LINK = 'nav[aria-label="Sidebar"] a[href][aria-current="page"]';
const ASIDE = "aside";
const LIST = 'aside, nav, main, form, dialog, [role="dialog"]';
const FOCUSABLE = "a[href], button:enabled, input:enabled, select:enabled, textarea:enabled, [tabindex]";
const WATCHED = { childList: true, subtree: true } as const;
const AFTER_THE_APP = 0;
const NONE = 0;
const NEXT = 1;
const NEWEST = -1;
const FIRST = 0;

type Hunt = () => Element | null;

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

interface Handlers {
  readonly changed: () => void;
  readonly focused: (event: unknown) => void;
  readonly blurred: (event: unknown) => void;
}

function isOnPage(element: unknown): element is HTMLElement {
  return element instanceof HTMLElement && element.isConnected && element.getClientRects().length > NONE;
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

function outsidePanel(selector: string): readonly Element[] {
  const found: Element[] = [];
  for (const each of globalThis.document.querySelectorAll(selector)) {
    if (each.closest(ASIDE) === null) {
      found.push(each);
    }
  }
  return found;
}

function panelMessage(): Element | null {
  const { document } = globalThis;
  return document.querySelector(PANEL_SELECTED) ?? [...document.querySelectorAll(PANEL_MESSAGES)].at(NEWEST) ?? null;
}

function mainMessage(): Element | null {
  return (
    outsidePanel(FEED_SELECTED).at(FIRST) ??
    outsidePanel(FEED_MESSAGES).at(NEWEST) ??
    outsidePanel(SELECTED_ROW).at(FIRST) ??
    outsidePanel(ROWS).at(FIRST) ??
    null
  );
}

function sidebarLink(): Element | null {
  return globalThis.document.querySelector(SIDEBAR_LINK);
}

const PLACES: readonly Hunt[] = [panelMessage, mainMessage, sidebarLink];
const KEPT_PLACES: ReadonlySet<Hunt> = new Set([panelMessage, mainMessage]);

function placesNow(): readonly unknown[] {
  return PLACES.map((hunt) => hunt());
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

function placesAfter(lost: Held): readonly unknown[] {
  return PLACES.map((hunt, rank) => {
    const was = lost.places[rank];
    if (KEPT_PLACES.has(hunt) && isOnPage(was)) {
      return was;
    }
    return hunt();
  });
}

function neighboursOf({ element, peers }: Held): readonly unknown[] {
  const at = peers.indexOf(element);
  return [...peers.slice(at + NEXT), ...peers.slice(FIRST, Math.max(at, FIRST)).toReversed()];
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

function createFocusKeeper(landing: Landing): FocusKeeper {
  let last: unknown = null;
  let held: Held | null = null;
  function recover(lost: Held): void {
    if (held === lost && isLost() && !landing.isLanding()) {
      held = null;
      [...neighboursOf(lost), ...placesAfter(lost)].some((place) => focusedOn(place));
    }
  }
  function goneFrom(lost: Held): void {
    if (held === lost && !isOnPage(lost.element)) {
      globalThis.setTimeout(recover, AFTER_THE_APP, lost);
    }
  }
  const handlers: Handlers = {
    blurred: (event) => {
      const was = held;
      if (was !== null && isLostFrom(event, was.element)) {
        queueMicrotask(() => {
          if (!isOnPage(was.element)) {
            goneFrom(was);
          } else if (held === was) {
            held = null;
          }
        });
      }
    },
    changed: () => {
      if (held !== null && held.element === globalThis.document.activeElement) {
        held = heldOf(held.element);
      } else if (held !== null) {
        goneFrom(held);
      }
    },
    focused: (event) => {
      if (event instanceof FocusEvent && event.target instanceof HTMLElement) {
        last = event.target;
        held = heldOf(event.target);
      }
    },
  };
  const stop = listening(handlers);
  return {
    landsOn: (event) => isLandingKey(event) && [last, ...placesNow()].some((place) => focusedOn(place)),
    stop,
  };
}

export { type FocusKeeper, type Landing, createFocusKeeper };
