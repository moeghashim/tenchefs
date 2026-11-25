import { useCallback, useMemo } from "react";
import type { FilterSuggestion } from "./filter-suggestions.ts";
import type { MentionOption } from "./mention-option.ts";
import type { Presences } from "../../board/index.ts";
import type { ReactNode } from "react";
import { Suggestions } from "../../design-system/controls.tsx";
import { mentionOptionOf } from "./mention-option.ts";
import { usePresences } from "./use-presence.ts";

const TEXT = { label: "Filter suggestions" } as const;

interface FilterSuggestionListProps {
  readonly list: string;
  readonly highlighted: number;
  readonly suggestions: readonly FilterSuggestion[];
  readonly onPick: (at: number) => void;
}

function spokenOf(suggestion: FilterSuggestion): string {
  if (suggestion.detail === null) {
    return suggestion.option;
  }
  return `${suggestion.option}, ${suggestion.detail}`;
}

function optionOf(suggestion: FilterSuggestion, presences: Presences): MentionOption {
  if (suggestion.identity !== null) {
    return mentionOptionOf({ identity: suggestion.identity, presences });
  }
  return {
    detail: suggestion.detail,
    identity: null,
    option: suggestion.option,
    presence: null,
    spoken: spokenOf(suggestion),
  };
}

export function FilterSuggestionList(props: FilterSuggestionListProps): ReactNode {
  const { onPick, suggestions } = props;
  const presences = usePresences();
  const options = useMemo(() => suggestions.map((each) => optionOf(each, presences)), [presences, suggestions]);
  const handleChoose = useCallback(
    (option: string) => {
      onPick(suggestions.findIndex((each) => each.option === option));
    },
    [onPick, suggestions],
  );
  return (
    <Suggestions
      highlighted={props.highlighted}
      label={TEXT.label}
      list={props.list}
      onChoose={handleChoose}
      options={options}
      place="below"
    />
  );
}
