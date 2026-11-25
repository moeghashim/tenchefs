import { optionIdOf } from "./option-id.ts";

interface ComboboxOf {
  readonly choosing: boolean;
  readonly list: string;
  readonly highlighted: number;
}

interface Combobox {
  readonly role?: "combobox";
  readonly expanded?: boolean;
  readonly autocomplete?: "list";
  readonly list?: string;
  readonly activeOption?: string;
}

const WRITING: Combobox = {};

function comboboxOf({ choosing, highlighted, list }: ComboboxOf): Combobox {
  if (!choosing) {
    return WRITING;
  }
  return {
    activeOption: optionIdOf({ index: highlighted, list }),
    autocomplete: "list",
    expanded: true,
    list,
    role: "combobox",
  };
}

export { comboboxOf };
