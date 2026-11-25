import type { MenuChoice } from "./menu-parts.ts";
import type { ReactNode } from "react";
import type { Shortcut } from "./shortcut.ts";

interface ChoiceKeysParts {
  readonly choices: readonly MenuChoice[];
}

interface Keyed {
  readonly label: string;
  readonly keys: string;
  readonly onSelect: () => void;
}

const NO_KEYS = "";
const UNKEYED: Shortcut = { keys: NO_KEYS, label: NO_KEYS };

function keyedOf(choice: MenuChoice): readonly Keyed[] {
  const { keys = UNKEYED } = choice;
  if (keys.keys === NO_KEYS || choice.href !== null || choice.disabled === true) {
    return [];
  }
  return [{ keys: keys.keys, label: choice.label, onSelect: choice.onSelect }];
}

export function ChoiceKeys(parts: ChoiceKeysParts): ReactNode {
  return parts.choices.flatMap(keyedOf).map((choice) => {
    const handleSelect = choice.onSelect;
    return (
      <button
        aria-keyshortcuts={choice.keys}
        aria-label={choice.label}
        hidden
        key={choice.label}
        onClick={handleSelect}
        type="button"
      />
    );
  });
}
