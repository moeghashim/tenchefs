import { PresenceDot } from "./presence-dot.tsx";
import type { ReactNode } from "react";
import type { SuggestionOptionParts } from "./avatar-parts.ts";
import { presenceNameOf } from "./presence-name.ts";
import { useCallback } from "react";

interface OptionParts extends SuggestionOptionParts {
  readonly highlighted: boolean;
  readonly onChoose: (option: string) => void;
}

function optionStyle(highlighted: boolean): string {
  if (highlighted) {
    return "bg-muted";
  }
  return "";
}

export function SuggestionOption(parts: OptionParts): ReactNode {
  const { onChoose, option, presence } = parts;
  const handleClick = useCallback(() => {
    onChoose(option);
  }, [onChoose, option]);
  return (
    <li>
      <button
        aria-current={parts.highlighted}
        aria-label={presenceNameOf({ name: parts.spoken, presence })}
        className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-foreground hover:bg-muted focus:bg-muted focus:outline-none ${optionStyle(parts.highlighted)}`}
        onClick={handleClick}
        type="button"
      >
        {presence !== null && (
          <PresenceDot
            label={presence.label}
            name={option}
            online={presence.online}
            place="inline"
            spoken={presence.spoken}
            unreachable={presence.unreachable}
            warning={presence.warning}
          />
        )}
        <span>{option}</span>
        {parts.detail !== null && <span className="truncate text-xs text-muted-foreground">{parts.detail}</span>}
      </button>
    </li>
  );
}
