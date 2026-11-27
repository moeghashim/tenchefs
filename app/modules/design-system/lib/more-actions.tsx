import { Portal, Root } from "@radix-ui/react-dropdown-menu";
import type { MenuChoice } from "./menu-parts.ts";
import { MoreActionsButton } from "./more-actions-button.tsx";
import { MoreActionsContent } from "./more-actions-content.tsx";
import type { ReactNode } from "react";
import { useFocusReturn } from "./use-focus-return.ts";

interface MoreActionsParts {
  readonly choices: readonly MenuChoice[];
  readonly label: string;
  readonly inTabOrder?: boolean;
}

export function MoreActions(parts: MoreActionsParts): ReactNode {
  const menu = useFocusReturn();
  const handleOpenChange = menu.onOpenChange;
  const handleReturned = menu.onReturned;
  return (
    <Root onOpenChange={handleOpenChange} open={menu.open}>
      <MoreActionsButton inTabOrder={parts.inTabOrder ?? true} label={parts.label} returning={menu.returning} />
      <Portal>
        <MoreActionsContent choices={parts.choices} onReturned={handleReturned} />
      </Portal>
    </Root>
  );
}
