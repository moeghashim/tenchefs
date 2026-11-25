import { boxOptionsOf, foundIdsOf } from "./search-options.ts";
import { useChannels, useSearchResults } from "./use-board.ts";
import { useMemo, useSyncExternalStore } from "react";
import type { BoxOption } from "./search-options.ts";
import type { FilterSuggestion } from "./filter-suggestions.ts";
import type { Identities } from "../../composer/index.ts";
import type { SearchState } from "../../search/web.ts";
import { filterSuggestionsOf } from "./filter-suggestions.ts";
import { recentDays } from "../../format/index.ts";

interface SearchLists {
  readonly options: readonly BoxOption[];
  readonly suggestions: readonly FilterSuggestion[];
  readonly suggesting: boolean;
  readonly shown: boolean;
  readonly active: number | null;
}

interface Listing {
  readonly identities: Identities;
  readonly state: SearchState;
}

const NONE = 0;

function activeOf(state: SearchState, lists: Omit<SearchLists, "active">): number | null {
  if (lists.suggesting) {
    return state.suggestion;
  }
  if (state.highlighted >= lists.options.length) {
    return null;
  }
  return state.highlighted;
}

type Found = Pick<SearchLists, "options" | "suggestions">;

function isSuggesting(state: SearchState, found: Found): boolean {
  return state.open && !state.dismissed && found.suggestions.length > NONE;
}

function isShown(state: SearchState, found: Found): boolean {
  return state.open && (found.options.length > NONE || state.found.status !== "idle");
}

function listsOf(state: SearchState, found: Found): SearchLists {
  const suggesting = isSuggesting(state, found);
  const shown = !suggesting && isShown(state, found);
  const lists = { ...found, shown, suggesting };
  return { ...lists, active: activeOf(state, lists) };
}

function useSearchLists({ identities, state }: Listing): SearchLists {
  const channels = useChannels();
  const everyone = useSyncExternalStore(identities.subscribe, identities.snapshot);
  const results = useSearchResults(foundIdsOf(state));
  return useMemo(
    () =>
      listsOf(state, {
        options: boxOptionsOf({ channels, identities: everyone, results, state }),
        suggestions: filterSuggestionsOf({ channels, days: recentDays(), identities: everyone, state }),
      }),
    [channels, everyone, results, state],
  );
}

export { useSearchLists };
