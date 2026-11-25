import type { ListboxGroup, ListboxOption } from "../../design-system/controls.tsx";
import { useCallback, useMemo } from "react";
import type { BoxOption } from "./search-options.ts";
import { Listbox } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { SearchResultOption } from "./search-result-option.tsx";
import { parseQuery } from "../../search/index.ts";

const TEXT = { results: "Search results" } as const;

interface SearchResultRowsProps {
  readonly options: readonly BoxOption[];
  readonly query: string;
  readonly highlighted: number;
  readonly list: string;
  readonly onChoose: (href: string) => void;
}

interface Listed extends ListboxOption {
  readonly option: BoxOption;
}

function groupsOf(options: readonly BoxOption[]): readonly ListboxGroup<Listed>[] {
  const groups = [...new Set(options.map((option) => option.group))];
  return groups.map((group) => ({
    label: group,
    options: options.filter((option) => option.group === group).map((option) => ({ option, value: option.href })),
  }));
}

export function SearchResultRows(props: SearchResultRowsProps): ReactNode {
  const parsed = useMemo(() => parseQuery(props.query), [props.query]);
  const groups = useMemo(() => groupsOf(props.options), [props.options]);
  const handleChoose = props.onChoose;
  const renderOption = useCallback(
    (listed: Listed) => <SearchResultOption option={listed.option} query={parsed} />,
    [parsed],
  );
  return (
    <Listbox
      groups={groups}
      highlighted={props.highlighted}
      label={TEXT.results}
      list={props.list}
      look="results"
      onChoose={handleChoose}
    >
      {renderOption}
    </Listbox>
  );
}
