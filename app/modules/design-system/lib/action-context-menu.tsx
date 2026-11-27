import { Portal, Root, Trigger } from "@radix-ui/react-context-menu";
import { ContextMenuContent } from "./context-menu-content.tsx";
import type { MenuChoice } from "./menu-parts.ts";
import type { ReactNode } from "react";
import { openOnMenuKey } from "./menu-keys.ts";
import { useSelectionMenu } from "./selection-menu.ts";

interface ActionContextMenuParts {
  readonly choices: readonly MenuChoice[];
  readonly label: string;
  readonly children: ReactNode;
}

export function ActionContextMenu(parts: ActionContextMenuParts): ReactNode {
  const handleKeyDown = openOnMenuKey;
  const selection = useSelectionMenu();
  const handleContextMenuCapture = selection.onContextMenuCapture;
  const handleMouseDownCapture = selection.onMouseDownCapture;
  return (
    <Root>
      <Trigger
        asChild
        onContextMenuCapture={handleContextMenuCapture}
        onKeyDown={handleKeyDown}
        onMouseDownCapture={handleMouseDownCapture}
      >
        {parts.children}
      </Trigger>
      <Portal>
        <ContextMenuContent choices={parts.choices} label={parts.label} />
      </Portal>
    </Root>
  );
}
