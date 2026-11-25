import type { MenuChoice } from "./menu-parts.ts";
import type { ReactNode } from "react";
import { menuIcon } from "./menu-icons.ts";

interface MenuChoiceTextParts {
  readonly choice: MenuChoice;
}

export function MenuChoiceText(parts: MenuChoiceTextParts): ReactNode {
  const { choice } = parts;
  const keys = choice.keys ?? null;
  return (
    <>
      {menuIcon(choice.icon)}
      {choice.label}
      {keys !== null && (
        <kbd aria-hidden className="ml-auto pl-4 font-sans text-muted-foreground">
          {keys.label}
        </kbd>
      )}
    </>
  );
}
