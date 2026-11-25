import type { Search, SearchState } from "../../search/web.ts";
import type { BoxOption } from "./search-options.ts";
import type { ReactNode } from "react";
import { SearchResultRows } from "./search-result-rows.tsx";
import { SearchSortChoice } from "./search-sort-choice.tsx";

const TEXT = { none: "No messages match.", searching: "Searching…" } as const;
const NONE = 0;

interface SearchResultsProps {
  readonly search: Search;
  readonly state: SearchState;
  readonly options: readonly BoxOption[];
  readonly list: string;
  readonly onChoose: (href: string) => void;
}

function noteOf(state: SearchState): string | null {
  const { found } = state;
  if (found.status === "searching") {
    return TEXT.searching;
  }
  if (found.status === "refused") {
    return found.message;
  }
  if (found.status === "found" && found.ids.length === NONE) {
    return TEXT.none;
  }
  return null;
}

export function SearchResults(props: SearchResultsProps): ReactNode {
  const { state } = props;
  const note = noteOf(state);
  const handleChoose = props.onChoose;
  return (
    <div className="absolute inset-x-4 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-lg border bg-background p-1 shadow-lg">
      {state.found.status !== "idle" && <SearchSortChoice search={props.search} state={state} />}
      <SearchResultRows
        highlighted={state.highlighted}
        list={props.list}
        onChoose={handleChoose}
        options={props.options}
        query={state.query}
      />
      {note !== null && <output className="block px-3 py-2 text-sm text-muted-foreground">{note}</output>}
    </div>
  );
}
