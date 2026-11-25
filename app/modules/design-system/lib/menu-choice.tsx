import { createElement, useCallback } from "react";
import type { MenuChoice as Choice } from "./menu-parts.ts";
import { MENU_ITEM } from "./menu-style.ts";
import { MenuChoiceText } from "./menu-choice-text.tsx";
import type { ReactNode } from "react";

interface ItemShape {
  readonly asChild: true;
  readonly onSelect?: () => void;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

type Item = (props: ItemShape) => ReactNode;

interface MenuChoiceParts {
  readonly choice: Choice;
  readonly item: Item;
  readonly onChoose: (action: () => void) => void;
}

const NO_KEYS = "";

function keysOf(choice: Choice): string {
  const keys = choice.keys ?? null;
  if (keys === null) {
    return NO_KEYS;
  }
  return keys.keys;
}

export function MenuChoice(parts: MenuChoiceParts): ReactNode {
  const { choice, onChoose } = parts;
  const RadixItem = parts.item;
  const handleSelect = useCallback(() => {
    if (choice.onSelect !== null) {
      onChoose(choice.onSelect);
    }
  }, [choice, onChoose]);
  if (choice.href !== null) {
    return (
      <RadixItem asChild>
        <a aria-keyshortcuts={keysOf(choice)} className={MENU_ITEM} href={choice.href}>
          {createElement(MenuChoiceText, { choice })}
        </a>
      </RadixItem>
    );
  }
  return (
    <RadixItem asChild disabled={choice.disabled ?? false} onSelect={handleSelect}>
      <div aria-keyshortcuts={keysOf(choice)} className={MENU_ITEM}>
        {createElement(MenuChoiceText, { choice })}
      </div>
    </RadixItem>
  );
}
