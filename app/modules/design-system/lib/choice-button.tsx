import type { ReactNode } from "react";
import { useCallback } from "react";

interface ChoiceButtonParts {
  readonly label: string;
  readonly name: string;
  readonly value: string;
  readonly chosen: boolean;
  readonly onChoose: (value: string) => void;
}

function choiceStyle(chosen: boolean): string {
  if (chosen) {
    return "bg-accent text-foreground";
  }
  return "text-muted-foreground hover:text-foreground";
}

export function ChoiceButton(parts: ChoiceButtonParts): ReactNode {
  const { onChoose, value } = parts;
  const handleChange = useCallback(() => {
    onChoose(value);
  }, [onChoose, value]);
  return (
    <label
      className={`flex-1 cursor-pointer rounded px-2 py-1 text-center whitespace-nowrap transition-colors has-focus-visible:ring-1 ${choiceStyle(parts.chosen)}`}
    >
      <input
        checked={parts.chosen}
        className="sr-only"
        name={parts.name}
        onChange={handleChange}
        type="radio"
        value={value}
      />
      {parts.label}
    </label>
  );
}
