import type { Search, SearchState } from "../../search/web.ts";
import { ChoiceGroup } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import type { SearchSort } from "../../search/index.ts";
import { searchSorts } from "../../search/index.ts";
import { useCallback } from "react";

const TEXT = { sort: "Sort results" } as const;

const SORTS = [
  { label: "Newest", value: "newest" },
  { label: "Best match", value: "best" },
] as const;

interface SearchSortChoiceProps {
  readonly search: Search;
  readonly state: SearchState;
}

function sortsOf(value: string): readonly SearchSort[] {
  return searchSorts.filter((sort) => sort === value);
}

export function SearchSortChoice(props: SearchSortChoiceProps): ReactNode {
  const { search } = props;
  const handleChoose = useCallback(
    (value: string) => {
      for (const sort of sortsOf(value)) {
        search.sortBy(sort);
      }
    },
    [search],
  );
  return (
    <div className="px-2 pt-1 pb-2">
      <ChoiceGroup choices={SORTS} label={TEXT.sort} onChoose={handleChoose} value={props.state.sort} />
    </div>
  );
}
