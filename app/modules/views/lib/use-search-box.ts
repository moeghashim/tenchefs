import type { Search, SearchState } from "../../search/web.ts";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { SearchResult } from "../../sdk/index.ts";
import { hrefOf } from "../../paths/index.ts";

const SHORTCUT = "k";
const NEAR_END_PX = 48;
const CAPTURE = { capture: true } as const;
const ONE = 1;

interface SearchBox {
  readonly area: RefObject<HTMLDivElement | null>;
  readonly box: RefObject<HTMLInputElement | null>;
}

interface Place {
  readonly search: Search;
  readonly area: () => HTMLDivElement | null;
  readonly box: () => HTMLInputElement | null;
  readonly back: () => unknown;
  readonly remember: (element: unknown) => void;
}

type Listener = (event: Readonly<Event>) => void;

interface Press {
  readonly key: string;
  readonly shortcut: boolean;
}

function searchHrefOf({ message }: SearchResult): string {
  if (message.kind === "reply") {
    return hrefOf({ channel: message.channel, message: message.id, name: "thread", thread: message.replyTo });
  }
  return hrefOf({ channel: message.channel, name: "thread", thread: message.id });
}

function highlightedOf(state: SearchState): readonly SearchResult[] {
  if (state.found.status !== "found" || state.highlighted === null) {
    return [];
  }
  return state.found.results.slice(state.highlighted, state.highlighted + ONE);
}

function present<Element>(element: Element | null): readonly Element[] {
  return [element].filter((each): each is Element => each !== null);
}

function focusable(element: unknown): readonly HTMLElement[] {
  return [element].filter((each): each is HTMLElement => each instanceof HTMLElement);
}

function isShortcut(event: Readonly<Event>): boolean {
  return (
    event instanceof KeyboardEvent &&
    event.key.toLowerCase() === SHORTCUT &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey
  );
}

function pressOf(event: Readonly<Event>): Press {
  if (!(event instanceof KeyboardEvent) || event.isComposing) {
    return { key: "", shortcut: false };
  }
  return { key: event.key, shortcut: isShortcut(event) };
}

function isInside(place: Place, event: Readonly<Event>): boolean {
  const area = place.area();
  return event.composedPath().some((target) => target === area);
}

function isLink(event: Readonly<Event>): boolean {
  return event.composedPath().some((target) => target instanceof HTMLAnchorElement);
}

function goBack(place: Place): void {
  const before = place.back();
  place.remember(null);
  for (const box of present(place.box())) {
    box.blur();
  }
  for (const element of focusable(before)) {
    element.focus();
  }
}

function choose(place: Place): void {
  for (const chosen of highlightedOf(place.search.snapshot())) {
    place.search.close();
    place.remember(null);
    globalThis.location.hash = searchHrefOf(chosen);
  }
}

function boxKeys(place: Place): Readonly<Partial<Record<string, () => void>>> {
  const { search } = place;
  return {
    ArrowDown: () => {
      search.move("down");
    },
    ArrowUp: () => {
      search.move("up");
    },
    Enter: () => {
      choose(place);
    },
    Escape: () => {
      search.close();
      goBack(place);
    },
  };
}

function shortcutOf(place: Place): Listener {
  return (event) => {
    if (pressOf(event).shortcut) {
      event.preventDefault();
      for (const box of present(place.box())) {
        box.focus();
        box.select();
      }
      place.search.open();
    }
  };
}

function pressedOf(place: Place): Listener {
  const keys = boxKeys(place);
  return (event) => {
    const action = keys[pressOf(event).key] ?? null;
    if (action !== null && event.target === place.box()) {
      event.preventDefault();
      action();
    }
  };
}

function typedOf(place: Place): Listener {
  return (event) => {
    for (const box of present(place.box())) {
      if (box === event.target) {
        place.search.edit(box.value);
      }
    }
  };
}

function focusedOf(place: Place): Listener {
  return (event) => {
    if (event.target === place.box()) {
      place.remember(Reflect.get(event, "relatedTarget"));
      place.search.open();
    } else if (!isInside(place, event)) {
      place.search.close();
    }
  };
}

function pointedOf(place: Place): Listener {
  return (event) => {
    if (!isInside(place, event)) {
      place.search.close();
    }
  };
}

function clickedOf(place: Place): Listener {
  return (event) => {
    if (isInside(place, event) && isLink(event)) {
      place.search.close();
      place.remember(null);
    }
  };
}

function isNearEnd(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.scrollTop + target.clientHeight >= target.scrollHeight - NEAR_END_PX;
}

function scrolledOf(place: Place): Listener {
  return (event) => {
    if (isNearEnd(event.target) && isInside(place, event)) {
      place.search.loadMore();
    }
  };
}

function on(type: keyof DocumentEventMap, listener: Listener): () => void {
  globalThis.document.addEventListener(type, listener, CAPTURE);
  return () => {
    globalThis.document.removeEventListener(type, listener, CAPTURE);
  };
}

function listen(place: Place): () => void {
  const stops = [
    on("keydown", shortcutOf(place)),
    on("keydown", pressedOf(place)),
    on("input", typedOf(place)),
    on("focusin", focusedOf(place)),
    on("pointerdown", pointedOf(place)),
    on("click", clickedOf(place)),
    on("scroll", scrolledOf(place)),
  ];
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}

function useSearchBox(search: Search): SearchBox {
  const area = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const back = useRef<unknown>(null);
  useEffect(
    () =>
      listen({
        area: () => area.current,
        back: () => back.current,
        box: () => box.current,
        remember: (element) => {
          back.current = element;
        },
        search,
      }),
    [search],
  );
  return { area, box };
}

export { searchHrefOf, useSearchBox };
