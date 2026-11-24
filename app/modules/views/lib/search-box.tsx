import type { ReactNode } from "react";
import type { Search } from "../../search/web.ts";
import { SearchResults } from "./search-results.tsx";
import { useSearchBox } from "./use-search-box.ts";
import { useSyncExternalStore } from "react";

const TEXT = { label: "Search", placeholder: "Search messages (Ctrl+K)" } as const;

interface SearchBoxProps {
  readonly search: Search;
}

export function SearchBox(props: SearchBoxProps): ReactNode {
  const { search } = props;
  const state = useSyncExternalStore(search.subscribe, search.snapshot);
  const { area, box } = useSearchBox(search);
  return (
    <div className="relative shrink-0 border-b px-4 py-2" ref={area}>
      <input
        aria-label={TEXT.label}
        autoComplete="off"
        className="h-8 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-muted-foreground"
        placeholder={TEXT.placeholder}
        ref={box}
        spellCheck={false}
        type="search"
        defaultValue={state.query}
      />
      {state.open && state.found.status !== "idle" && <SearchResults state={state} />}
    </div>
  );
}
