import type { ReactNode } from "react";
import { optionIdOf } from "./option-id.ts";

interface ComboboxFieldParts {
  readonly label: string;
  readonly placeholder: string;
  readonly keys: string;
  readonly list: string;
  readonly box: string;
  readonly expanded: boolean;
  readonly active: number | null;
  readonly defaultValue: string;
}

interface Active {
  readonly option?: string;
}

function activeOf({ active, expanded, list }: ComboboxFieldParts): Active {
  if (!expanded || active === null) {
    return {};
  }
  return { option: optionIdOf({ index: active, list }) };
}

export function ComboboxField(parts: ComboboxFieldParts): ReactNode {
  const active = activeOf(parts);
  return (
    <input
      aria-activedescendant={active.option}
      aria-autocomplete="list"
      aria-controls={parts.list}
      aria-expanded={parts.expanded}
      aria-keyshortcuts={parts.keys}
      aria-label={parts.label}
      autoComplete="off"
      className="h-8 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-muted-foreground"
      defaultValue={parts.defaultValue}
      id={parts.box}
      placeholder={parts.placeholder}
      role="combobox"
      spellCheck={false}
      type="search"
    />
  );
}
