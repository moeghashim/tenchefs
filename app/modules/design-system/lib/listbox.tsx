import { Fragment, useCallback, useEffect, useMemo } from "react";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import type { OptionAt } from "./option-id.ts";
import { optionIdOf } from "./option-id.ts";

interface ListboxOption {
  readonly value: string;
  readonly spoken?: string;
}

interface ListboxGroup<Option extends ListboxOption> {
  readonly label: string | null;
  readonly options: readonly Option[];
}

type Look = "menu" | "menu below" | "results";

interface ListboxParts<Option extends ListboxOption> {
  readonly list: string;
  readonly label: string;
  readonly look: Look;
  readonly groups: readonly ListboxGroup<Option>[];
  readonly highlighted: number;
  readonly onChoose: (value: string) => void;
  readonly children: (option: Option) => ReactNode;
}

interface Placed<Option extends ListboxOption> {
  readonly option: Option;
  readonly index: number;
}

interface PlacedGroup<Option extends ListboxOption> {
  readonly label: string | null;
  readonly placed: readonly Placed<Option>[];
}

interface Drawn<Option extends ListboxOption> {
  readonly list: string;
  readonly look: Look;
  readonly highlighted: number;
  readonly handleMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  readonly render: (option: Option) => ReactNode;
}

const LOOKS = {
  menu: {
    listbox:
      "absolute bottom-full left-0 z-50 mb-2 flex min-w-56 flex-col rounded-md border bg-background py-1 text-sm shadow-lg",
    option: "flex w-full cursor-pointer items-baseline gap-2 px-3 py-1.5 text-left text-foreground hover:bg-muted",
    scrolls: false,
  },
  "menu below": {
    listbox:
      "absolute top-full left-4 z-50 mt-1 flex min-w-56 flex-col rounded-md border bg-background py-1 text-sm shadow-lg",
    option: "flex w-full cursor-pointer items-baseline gap-2 px-3 py-1.5 text-left text-foreground hover:bg-muted",
    scrolls: false,
  },
  results: {
    listbox: "flex flex-col gap-1",
    option: "flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-1.5 text-sm hover:bg-muted",
    scrolls: true,
  },
} as const;

const NEAREST = { block: "nearest" } as const;
const FIRST = 0;

function highlightStyle(highlighted: boolean): string {
  if (highlighted) {
    return "bg-muted";
  }
  return "";
}

function placedOf<Option extends ListboxOption>(
  groups: readonly ListboxGroup<Option>[],
): readonly PlacedGroup<Option>[] {
  const counts = groups.map((group) => group.options.length);
  return groups.map((group, at) => {
    const start = counts.slice(FIRST, at).reduce((total, count) => total + count, FIRST);
    return {
      label: group.label,
      placed: group.options.map((option, offset) => ({ index: start + offset, option })),
    };
  });
}

function optionsOf<Option extends ListboxOption>(
  group: PlacedGroup<Option>,
  drawn: Drawn<Option>,
): readonly ReactNode[] {
  return group.placed.map((each) => (
    <div
      aria-label={each.option.spoken}
      aria-selected={each.index === drawn.highlighted}
      className={`${LOOKS[drawn.look].option} ${highlightStyle(each.index === drawn.highlighted)}`}
      id={optionIdOf({ index: each.index, list: drawn.list })}
      key={each.option.value}
      onMouseDown={drawn.handleMouseDown}
      role="option"
      tabIndex={-1}
    >
      {drawn.render(each.option)}
    </div>
  ));
}

function groupOf<Option extends ListboxOption>(group: PlacedGroup<Option>, drawn: Drawn<Option>): ReactElement {
  if (group.label === null) {
    return <Fragment key={FIRST}>{optionsOf(group, drawn)}</Fragment>;
  }
  return (
    <div aria-label={group.label} className="flex flex-col" key={group.label} role="group">
      <div aria-hidden className="px-3 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
        {group.label}
      </div>
      {optionsOf(group, drawn)}
    </div>
  );
}

function scrollToOption(at: OptionAt): void {
  const option = document.querySelector(`#${CSS.escape(optionIdOf(at))}`);
  if (option !== null) {
    option.scrollIntoView(NEAREST);
  }
}

export function Listbox<Option extends ListboxOption>(parts: ListboxParts<Option>): ReactNode {
  const { children: render, highlighted, list, look, onChoose } = parts;
  const groups = useMemo(() => placedOf(parts.groups), [parts.groups]);
  const options = useMemo(() => groups.flatMap((group) => group.placed), [groups]);
  const chosen = options
    .filter((each) => each.index === highlighted)
    .map((each) => each.option.value)
    .join("");
  useEffect(() => {
    if (LOOKS[look].scrolls && chosen !== "") {
      scrollToOption({ index: highlighted, list });
    }
  }, [chosen, highlighted, list, look]);
  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const { id } = event.currentTarget;
      for (const each of options) {
        if (optionIdOf({ index: each.index, list }) === id) {
          onChoose(each.option.value);
        }
      }
    },
    [list, onChoose, options],
  );
  const drawn = { handleMouseDown, highlighted, list, look, render };
  return (
    <div aria-label={parts.label} className={LOOKS[look].listbox} id={list} role="listbox">
      {groups.map((group) => groupOf(group, drawn))}
    </div>
  );
}

export type { ListboxGroup, ListboxOption };
