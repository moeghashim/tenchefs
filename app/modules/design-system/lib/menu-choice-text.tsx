import type { MenuChoice } from "./menu-parts.ts";
import type { ReactNode } from "react";
import { menuIcon } from "./menu-icons.ts";

interface MenuChoiceTextParts {
  readonly choice: MenuChoice;
}

export function MenuChoiceText(parts: MenuChoiceTextParts): ReactNode {
  const { choice } = parts;
  return (
    <>
      {menuIcon(choice.icon)}
      {choice.label}
      <kbd aria-hidden className="ml-auto pl-4 font-sans text-muted-foreground">
        {choice.keys.label}
      </kbd>
    </>
  );
}
