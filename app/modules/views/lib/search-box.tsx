import { useContext, useId, useSyncExternalStore } from "react";
import { ComboboxField } from "../../design-system/controls.tsx";
import { FilterSuggestionList } from "./filter-suggestion-list.tsx";
import type { Identities } from "../../composer/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import { LandingContext } from "../../landing/index.ts";
import type { ReactNode } from "react";
import type { Search } from "../../search/web.ts";
import { SearchResults } from "./search-results.tsx";
import { useSearchBox } from "./use-search-box.ts";
import { useSearchLists } from "./use-search-lists.ts";

const TEXT = { label: "Search", placeholder: "Go to or search" } as const;

interface SearchBoxProps {
  readonly identities: Identities;
  readonly keymap: Keymap;
  readonly search: Search;
}

export function SearchBox(props: SearchBoxProps): ReactNode {
  const shortcut = props.keymap.shortcutOf("openSearch");
  const list = useId();
  const field = useId();
  const state = useSyncExternalStore(props.search.subscribe, props.search.snapshot);
  const lists = useSearchLists({ identities: props.identities, state });
  const {
    area,
    choose: handleChoose,
    pick: handlePick,
  } = useSearchBox({ ...props, box: field, land: useContext(LandingContext).ask });
  return (
    <div className="relative shrink-0 border-b px-4 py-2" ref={area}>
      <ComboboxField
        active={lists.active}
        box={field}
        defaultValue={state.query}
        expanded={lists.suggesting || lists.shown}
        keys={shortcut.keys}
        label={TEXT.label}
        list={list}
        placeholder={`${TEXT.placeholder} (${shortcut.label})`}
      />
      {lists.suggesting && (
        <FilterSuggestionList
          highlighted={state.suggestion}
          list={list}
          onPick={handlePick}
          suggestions={lists.suggestions}
        />
      )}
      {lists.shown && (
        <SearchResults
          list={list}
          onChoose={handleChoose}
          options={lists.options}
          search={props.search}
          state={state}
        />
      )}
    </div>
  );
}
