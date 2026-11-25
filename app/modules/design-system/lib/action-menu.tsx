import { ActionContextMenu } from "./action-context-menu.tsx";
import type { ActionMenuParts } from "./menu-parts.ts";
import { HoverMoreActions } from "./hover-more-actions.tsx";
import type { ReactNode } from "react";

const TEXT = { more: "More actions" } as const;

interface ActionMenuFrame extends ActionMenuParts {
  readonly inline?: boolean;
  readonly moreInTabOrder?: boolean;
  readonly children: ReactNode;
}

export function ActionMenu(parts: ActionMenuFrame): ReactNode {
  const { choices } = parts;
  const inline = parts.inline ?? false;
  const more = (
    <HoverMoreActions
      choices={choices}
      inTabOrder={parts.moreInTabOrder ?? true}
      inline={inline}
      label={parts.buttonLabel ?? TEXT.more}
    />
  );
  if (inline) {
    return (
      <ActionContextMenu choices={choices} label={parts.label}>
        <span className="group/inline-actions relative inline-flex">
          {parts.children}
          {more}
        </span>
      </ActionContextMenu>
    );
  }
  return (
    <ActionContextMenu choices={choices} label={parts.label}>
      <div className="group/actions relative flex flex-1">
        {parts.children}
        {more}
      </div>
    </ActionContextMenu>
  );
}
