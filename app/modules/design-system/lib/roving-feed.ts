const ITEM = "article";
const FOLD = "[data-closed-fold]";
const INNER =
  "a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]:not([contenteditable=false])";
const SAVED = "data-feed-tabindex";
const CURRENT = "data-feed-current";
const TAB_STOP = 0;
const OUT_OF_TAB_ORDER = -1;
const UNKNOWN_SIZE = -1;
const FIRST_POSITION = 1;
const NONE = 0;
const WATCHED: MutationObserverInit = { childList: true, subtree: true };

interface Roving {
  readonly place: () => void;
  readonly focused: (event: Readonly<Event>) => void;
  readonly blurred: (event: Readonly<Event>) => void;
}

interface Feed {
  readonly feed: string;
  readonly more: boolean;
}

function feedOf(feed: string): string {
  return `[id="${feed}"]`;
}

function itemsIn(feed: string): readonly HTMLElement[] {
  return [...globalThis.document.querySelectorAll<HTMLElement>(`${feedOf(feed)} ${ITEM}`)];
}

function currentIn(feed: string): HTMLElement | null {
  return globalThis.document.querySelector<HTMLElement>(`${feedOf(feed)} ${ITEM}[${CURRENT}]`);
}

function sizeOf(count: number, more: boolean): string {
  if (more) {
    return String(UNKNOWN_SIZE);
  }
  return String(count);
}

function tabIndexOf(stop: boolean): number {
  if (stop) {
    return TAB_STOP;
  }
  return OUT_OF_TAB_ORDER;
}

function hideOthers(feed: string): void {
  const inner = `${feedOf(feed)} ${ITEM}[tabindex="${String(OUT_OF_TAB_ORDER)}"] :is(${INNER}):not([${SAVED}])`;
  for (const control of globalThis.document.querySelectorAll<HTMLElement>(inner)) {
    control.setAttribute(SAVED, control.getAttribute("tabindex") ?? "");
    control.tabIndex = OUT_OF_TAB_ORDER;
  }
}

function showStop(feed: string): void {
  const inner = `${feedOf(feed)} ${ITEM}[tabindex="${String(TAB_STOP)}"] [${SAVED}]`;
  for (const control of globalThis.document.querySelectorAll<HTMLElement>(inner)) {
    const saved = control.getAttribute(SAVED) ?? "";
    control.removeAttribute(SAVED);
    control.removeAttribute("tabindex");
    if (saved !== "") {
      control.setAttribute("tabindex", saved);
    }
  }
}

function lostFocus(): boolean {
  const active = globalThis.document.activeElement;
  return active === null || active === globalThis.document.body;
}

function markItems({ feed, more }: Feed, stop: number): void {
  const items = itemsIn(feed);
  const size = sizeOf(items.length, more);
  for (const [index, item] of items.entries()) {
    item.setAttribute("aria-posinset", String(index + FIRST_POSITION));
    item.setAttribute("aria-setsize", size);
    item.tabIndex = tabIndexOf(index === stop);
  }
  hideOthers(feed);
  showStop(feed);
}

function stopIn(feed: string): number {
  const items = itemsIn(feed);
  const current = currentIn(feed);
  if (current === null) {
    return items.length - FIRST_POSITION;
  }
  return items.indexOf(current);
}

function focusIf(focused: boolean, item: Readonly<Pick<HTMLElement, "focus">>): void {
  if (focused && lostFocus()) {
    item.focus();
  }
}

function besideFoldAt(feed: string, at: number): HTMLElement | null {
  const items: readonly unknown[] = itemsIn(feed);
  const folds: readonly unknown[] = [...globalThis.document.querySelectorAll(`${feedOf(feed)} ${ITEM}${FOLD}`)];
  const messages = [...globalThis.document.querySelectorAll<HTMLElement>(`${feedOf(feed)} ${ITEM}:not(${FOLD})`)];
  const passed = at - folds.indexOf(items[at]);
  return messages[passed] ?? messages[passed - FIRST_POSITION] ?? null;
}

function itemAt(feed: string, index: number): HTMLElement | null {
  const items = itemsIn(feed);
  const at = Math.min(index, items.length - FIRST_POSITION);
  const item = items[at] ?? null;
  if (item === null || !item.matches(FOLD)) {
    return item;
  }
  return besideFoldAt(feed, at) ?? item;
}

function rovingOf(shown: Feed): Roving {
  const { feed } = shown;
  let at = NONE;
  let held = false;
  let focused = false;
  function replace(): void {
    const replacement = itemAt(feed, at);
    if (!held || replacement === null || currentIn(feed) !== null) {
      return;
    }
    replacement.setAttribute(CURRENT, "");
    focusIf(focused, replacement);
  }
  function place(): void {
    replace();
    const stop = stopIn(feed);
    at = Math.max(stop, NONE);
    markItems(shown, stop);
  }
  return {
    blurred: (event) => {
      const next: unknown = Reflect.get(event, "relatedTarget");
      if (next instanceof Element && next.closest(feedOf(feed)) === null) {
        focused = false;
      }
    },
    focused: () => {
      for (const was of globalThis.document.querySelectorAll(`${feedOf(feed)} [${CURRENT}]`)) {
        was.removeAttribute(CURRENT);
      }
      for (const item of globalThis.document.querySelectorAll(`${feedOf(feed)} ${ITEM}:focus-within`)) {
        item.setAttribute(CURRENT, "");
        held = true;
        focused = true;
      }
      place();
    },
    place,
  };
}

function watchFeed(shown: Feed): () => void {
  const roving = rovingOf(shown);
  const observer = new MutationObserver(roving.place);
  const element = globalThis.document.querySelector(feedOf(shown.feed));
  if (element !== null) {
    observer.observe(element, WATCHED);
    element.addEventListener("focusin", roving.focused);
    element.addEventListener("focusout", roving.blurred);
  }
  roving.place();
  return () => {
    observer.disconnect();
    if (element !== null) {
      element.removeEventListener("focusin", roving.focused);
      element.removeEventListener("focusout", roving.blurred);
    }
  };
}

export { watchFeed };
