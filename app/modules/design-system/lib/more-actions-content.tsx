import { Content, Item } from "@radix-ui/react-dropdown-menu";
import type { MenuChoice as Choice } from "./menu-parts.ts";
import { MENU } from "./menu-style.ts";
import { MenuChoice } from "./menu-choice.tsx";
import type { ReactNode } from "react";
import { useAfterClose } from "./use-after-close.ts";
import { useCallback } from "react";

interface MoreActionsContentParts {
  readonly choices: readonly Choice[];
  readonly onReturned: () => void;
}

export function MoreActionsContent(parts: MoreActionsContentParts): ReactNode {
  const after = useAfterClose();
  const { onReturned } = parts;
  const handleChoose = after.onChoose;
  const handleCloseAutoFocus = useCallback(() => {
    after.onCloseAutoFocus();
    onReturned();
  }, [after, onReturned]);
  return (
    <Content align="end" asChild onCloseAutoFocus={handleCloseAutoFocus}>
      <div className={MENU}>
        {parts.choices.map((choice) => (
          <MenuChoice choice={choice} item={Item} key={choice.label} onChoose={handleChoose} />
        ))}
      </div>
    </Content>
  );
}
