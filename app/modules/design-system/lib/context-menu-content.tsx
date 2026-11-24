import { Content, Item } from "@radix-ui/react-context-menu";
import type { MenuChoice as Choice } from "./menu-parts.ts";
import { MENU } from "./menu-style.ts";
import { MenuChoice } from "./menu-choice.tsx";
import type { ReactNode } from "react";
import { useAfterClose } from "./use-after-close.ts";

interface ContextMenuContentParts {
  readonly choices: readonly Choice[];
  readonly label: string;
}

export function ContextMenuContent(parts: ContextMenuContentParts): ReactNode {
  const after = useAfterClose();
  const handleChoose = after.onChoose;
  const handleCloseAutoFocus = after.onCloseAutoFocus;
  return (
    <Content asChild onCloseAutoFocus={handleCloseAutoFocus}>
      <div aria-label={parts.label} className={MENU}>
        {parts.choices.map((choice) => (
          <MenuChoice choice={choice} item={Item} key={choice.label} onChoose={handleChoose} />
        ))}
      </div>
    </Content>
  );
}
