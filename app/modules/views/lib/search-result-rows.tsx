import type { ReactNode } from "react";
import type { SearchResult } from "../../sdk/index.ts";
import { SearchResultRow } from "./search-result-row.tsx";
import { parseQuery } from "../../search/index.ts";
import { useMemo } from "react";

const TEXT = { results: "Search results" } as const;

interface SearchResultRowsProps {
  readonly results: readonly SearchResult[];
  readonly query: string;
  readonly highlighted: number | null;
}

export function SearchResultRows(props: SearchResultRowsProps): ReactNode {
  const parsed = useMemo(() => parseQuery(props.query), [props.query]);
  return (
    <ul aria-label={TEXT.results} className="flex flex-col">
      {props.results.map((result, at) => (
        <SearchResultRow current={at === props.highlighted} key={result.message.id} query={parsed} result={result} />
      ))}
    </ul>
  );
}
