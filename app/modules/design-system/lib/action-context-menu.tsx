import { Portal, Root, Trigger } from "@radix-ui/react-context-menu";
import { ContextMenuContent } from "./context-menu-content.tsx";
import type { MenuChoice } from "./menu-parts.ts";
import type { ReactNode } from "react";
import { openOnMenuKey } from "./menu-keys.ts";

interface ActionContextMenuParts {
  readonly choices: readonly MenuChoice[];
  readonly label: string;
  readonly children: ReactNode;
}

export function ActionContextMenu(parts: ActionContextMenuParts): ReactNode {
  const handleKeyDown = openOnMenuKey;
  return (
    <Root>
      <Trigger asChild onKeyDown={handleKeyDown}>
        {parts.children}
      </Trigger>
      <Portal>
        <ContextMenuContent choices={parts.choices} label={parts.label} />
      </Portal>
    </Root>
  );
}
