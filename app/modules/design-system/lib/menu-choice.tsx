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

export function MenuChoice(parts: MenuChoiceParts): ReactNode {
  const { choice, onChoose } = parts;
  const RadixItem = parts.item;
  const handleSelect = useCallback(() => {
    if (choice.onSelect !== null) {
      onChoose(choice.onSelect);
    }
  }, [choice, onChoose]);
  const handleFollow = useCallback(() => {
    if (choice.onSelect !== null) {
      choice.onSelect();
    }
  }, [choice]);
  if (choice.href !== null) {
    return (
      <RadixItem asChild>
        <a aria-keyshortcuts={choice.keys.keys} className={MENU_ITEM} href={choice.href} onClick={handleFollow}>
          {createElement(MenuChoiceText, { choice })}
        </a>
      </RadixItem>
    );
  }
  return (
    <RadixItem asChild disabled={choice.disabled ?? false} onSelect={handleSelect}>
      <div aria-keyshortcuts={choice.keys.keys} className={MENU_ITEM}>
        {createElement(MenuChoiceText, { choice })}
      </div>
    </RadixItem>
  );
}
