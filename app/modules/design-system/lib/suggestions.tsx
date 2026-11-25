import type { SuggestionOptionParts, SuggestionsParts } from "./avatar-parts.ts";
import { useCallback, useMemo } from "react";
import { Listbox } from "./listbox.tsx";
import type { ListboxOption } from "./listbox.tsx";
import type { ReactNode } from "react";
import { SuggestionOption } from "./suggestion-option.tsx";
import { presenceNameOf } from "./presence-name.ts";

interface Suggested extends ListboxOption {
  readonly suggestion: SuggestionOptionParts;
}

function suggestedOf(suggestion: SuggestionOptionParts): Suggested {
  return {
    spoken: presenceNameOf({ name: suggestion.spoken, presence: suggestion.presence }),
    suggestion,
    value: suggestion.option,
  };
}

const LOOKS = { above: "menu", below: "menu below" } as const;

export function Suggestions(parts: SuggestionsParts): ReactNode {
  const handleChoose = parts.onChoose;
  const groups = useMemo(() => [{ label: null, options: parts.options.map(suggestedOf) }], [parts.options]);
  const renderOption = useCallback(
    (suggested: Suggested) => (
      <SuggestionOption
        detail={suggested.suggestion.detail}
        identity={suggested.suggestion.identity}
        option={suggested.suggestion.option}
        presence={suggested.suggestion.presence}
        spoken={suggested.suggestion.spoken}
      />
    ),
    [],
  );
  return (
    <Listbox
      groups={groups}
      highlighted={parts.highlighted}
      label={parts.label}
      list={parts.list}
      look={LOOKS[parts.place ?? "above"]}
      onChoose={handleChoose}
    >
      {renderOption}
    </Listbox>
  );
}
