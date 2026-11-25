import type { BoxOption } from "./search-options.ts";
import type { ParsedQuery } from "../../search/index.ts";
import type { ReactNode } from "react";
import { ResultOption } from "../../design-system/controls.tsx";
import { SearchResultRow } from "./search-result-row.tsx";

interface SearchResultOptionProps {
  readonly option: BoxOption;
  readonly query: ParsedQuery;
}

export function SearchResultOption(props: SearchResultOptionProps): ReactNode {
  const { option } = props;
  return (
    <>
      {option.kind === "jump" && <ResultOption detail={option.detail} label={option.label} />}
      {option.kind === "message" && <SearchResultRow query={props.query} result={option.result} />}
    </>
  );
}
