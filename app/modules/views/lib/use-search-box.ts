import { aheadOf, boxOptionsOf, foundIdsOf } from "./search-options.ts";
import { channelList, searchResultsOf } from "../../board/index.ts";
import { filterSuggestionsOf, pickedOf } from "./filter-suggestions.ts";
import { useCallback, useEffect, useRef } from "react";
import type { BoardStore } from "../../board/index.ts";
import type { BoxOption } from "./search-options.ts";
import type { FilterSuggestion } from "./filter-suggestions.ts";
import type { Identities } from "../../composer/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import type { RefObject } from "react";
import type { Search } from "../../search/web.ts";
import type { SearchResult } from "../../sdk/index.ts";
import { recentDays } from "../../format/index.ts";
import { useBoardStore } from "./use-board.ts";

const NEAR_END_PX = 48;
const CAPTURE = { capture: true } as const;
const ONE = 1;
const NONE = 0;

interface SearchBox {
  readonly area: RefObject<HTMLDivElement | null>;
  readonly choose: (href: string) => void;
  readonly pick: (at: number) => void;
}

interface SearchBoxStores {
  readonly box: string;
  readonly identities: Identities;
  readonly keymap: Keymap;
  readonly land: () => void;
  readonly search: Search;
}

interface Place {
  readonly search: Search;
  readonly options: () => readonly BoxOption[];
  readonly suggestions: () => readonly FilterSuggestion[];
  readonly area: () => HTMLDivElement | null;
  readonly box: () => Element | null;
  readonly back: () => unknown;
  readonly land: () => void;
  readonly remember: (element: unknown) => void;
}

type Listener = (event: Readonly<Event>) => void;

function inputs(element: unknown): readonly HTMLInputElement[] {
  return [element].filter((each): each is HTMLInputElement => each instanceof HTMLInputElement);
}

function focusable(element: unknown): readonly HTMLElement[] {
  return [element].filter((each): each is HTMLElement => each instanceof HTMLElement);
}

function isInside(place: Place, event: Readonly<Event>): boolean {
  const area = place.area();
  return event.composedPath().some((target) => target === area);
}

function goBack(place: Place): void {
  const before = place.back();
  place.remember(null);
  for (const box of inputs(place.box())) {
    box.blur();
  }
  for (const element of focusable(before)) {
    element.focus();
  }
}

function go(place: Place, href: string): void {
  for (const box of inputs(place.box())) {
    box.value = "";
  }
  place.search.edit("");
  place.search.close();
  place.remember(null);
  globalThis.location.hash = href;
  place.land();
}

function chooseHighlighted(place: Place): void {
  const { highlighted } = place.search.snapshot();
  for (const chosen of place.options().slice(highlighted, highlighted + ONE)) {
    go(place, chosen.href);
  }
}

function pick(place: Place, at: number): void {
  const state = place.search.snapshot();
  for (const chosen of place.suggestions().slice(at, at + ONE)) {
    const picked = pickedOf({ state, suggestion: chosen });
    for (const box of inputs(place.box())) {
      box.value = picked.query;
      box.setSelectionRange(picked.caret, picked.caret);
    }
    place.search.edit(picked.query, picked.caret);
  }
}

function isSuggesting(place: Place): boolean {
  const { dismissed, open } = place.search.snapshot();
  return open && !dismissed && place.suggestions().length > NONE;
}

function moved(place: Place, direction: "down" | "up"): true {
  if (isSuggesting(place)) {
    place.search.moveSuggestion(direction, place.suggestions().length);
  } else {
    place.search.move(direction, aheadOf(place.options()));
  }
  return true;
}

function bindBox(place: Place, keymap: Keymap): () => void {
  const { search } = place;
  return keymap.bind({
    actions: {
      closeSearch: () => {
        search.close();
        goBack(place);
        return true;
      },
      dismissSuggestions: () => {
        if (!isSuggesting(place)) {
          return false;
        }
        search.dismissSuggestions();
        return true;
      },
      highlightNext: () => moved(place, "down"),
      highlightPrevious: () => moved(place, "up"),
      openHighlighted: () => {
        chooseHighlighted(place);
        return true;
      },
      pickSuggestion: () => {
        if (!isSuggesting(place)) {
          return false;
        }
        pick(place, search.snapshot().suggestion);
        return true;
      },
    },
    scope: "search box",
    within: place.box,
  });
}

function bindOpen(place: Place, keymap: Keymap): () => void {
  return keymap.bind({
    actions: {
      openSearch: () => {
        for (const box of inputs(place.box())) {
          box.focus();
          box.select();
        }
        place.search.open();
        return true;
      },
    },
    scope: "everywhere",
  });
}

function typedOf(place: Place): Listener {
  return (event) => {
    for (const box of inputs(place.box())) {
      if (box === event.target) {
        place.search.edit(box.value, Number(box.selectionEnd));
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

function listen(place: Place, keymap: Keymap): () => void {
  const stops = [
    bindOpen(place, keymap),
    bindBox(place, keymap),
    on("input", typedOf(place)),
    on("focusin", focusedOf(place)),
    on("pointerdown", pointedOf(place)),
    on("scroll", scrolledOf(place)),
  ];
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}

function resultsNow(store: BoardStore, search: Search): readonly SearchResult[] {
  const select = searchResultsOf(foundIdsOf(search.snapshot()));
  return select(store.snapshot());
}

function useSearchBox({ box, identities, keymap, land, search }: SearchBoxStores): SearchBox {
  const store = useBoardStore();
  const area = useRef<HTMLDivElement>(null);
  const back = useRef<unknown>(null);
  const place = useCallback(
    (): Place => ({
      area: () => area.current,
      back: () => back.current,
      box: () => globalThis.document.querySelector(`[id="${box}"]`),
      land,
      options: () =>
        boxOptionsOf({
          channels: channelList(store.snapshot()),
          identities: identities.snapshot(),
          results: resultsNow(store, search),
          state: search.snapshot(),
        }),
      remember: (element) => {
        back.current = element;
      },
      search,
      suggestions: () =>
        filterSuggestionsOf({
          channels: channelList(store.snapshot()),
          days: recentDays(),
          identities: identities.snapshot(),
          state: search.snapshot(),
        }),
    }),
    [box, identities, land, search, store],
  );
  useEffect(() => listen(place(), keymap), [keymap, place]);
  const choose = useCallback(
    (href: string) => {
      go(place(), href);
    },
    [place],
  );
  const pickAt = useCallback(
    (at: number) => {
      pick(place(), at);
    },
    [place],
  );
  return { area, choose, pick: pickAt };
}

export { useSearchBox };
