import type { MenuChoice as Choice } from "./menu-parts.ts";
import { MENU_ITEM } from "./menu-style.ts";
import type { ReactNode } from "react";
import { ShortcutTooltip } from "./shortcut-tooltip.tsx";
import { menuIcon } from "./menu-icons.ts";
import { useCallback } from "react";

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
  if (choice.href !== null) {
    return (
      <RadixItem asChild>
        <a className={MENU_ITEM} href={choice.href}>
          {menuIcon(choice.icon)}
          {choice.label}
        </a>
      </RadixItem>
    );
  }
  const item = (
    <RadixItem asChild disabled={choice.disabled ?? false} onSelect={handleSelect}>
      <div className={MENU_ITEM}>
        {menuIcon(choice.icon)}
        {choice.label}
      </div>
    </RadixItem>
  );
  const shortcut = choice.shortcut ?? null;
  if (shortcut === null) {
    return item;
  }
  return (
    <ShortcutTooltip label={choice.label} shortcut={shortcut}>
      {item}
    </ShortcutTooltip>
  );
}
