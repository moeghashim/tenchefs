import type { ReactNode } from "react";
import { SearchResultRows } from "./search-result-rows.tsx";
import type { SearchState } from "../../search/web.ts";

const TEXT = { none: "No messages match.", searching: "Searching…" } as const;
const NONE = 0;

interface SearchResultsProps {
  readonly state: SearchState;
}

function noteOf(state: SearchState): string | null {
  const { found } = state;
  if (found.status === "searching") {
    return TEXT.searching;
  }
  if (found.status === "refused") {
    return found.message;
  }
  if (found.status === "found" && found.results.length === NONE) {
    return TEXT.none;
  }
  return null;
}

export function SearchResults(props: SearchResultsProps): ReactNode {
  const { state } = props;
  const note = noteOf(state);
  return (
    <div className="absolute inset-x-4 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-lg border bg-background p-1 shadow-lg">
      {note !== null && <output className="block px-3 py-2 text-sm text-muted-foreground">{note}</output>}
      {state.found.status === "found" && (
        <SearchResultRows highlighted={state.highlighted} query={state.query} results={state.found.results} />
      )}
    </div>
  );
}
