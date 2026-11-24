import { ActionMenu } from "./action-menu.tsx";
import type { ActionMenuParts } from "./menu-parts.ts";
import { PanelTitleText } from "./panel-title-text.tsx";
import type { ReactNode } from "react";

interface PanelTitleParts {
  readonly label: string;
  readonly detail: string;
  readonly menu: ActionMenuParts | null;
}

export function PanelTitle(parts: PanelTitleParts): ReactNode {
  const { menu } = parts;
  if (menu === null) {
    return <PanelTitleText detail={parts.detail} focusable={false} label={parts.label} />;
  }
  return (
    <ActionMenu choices={menu.choices} label={menu.label}>
      <PanelTitleText detail={parts.detail} focusable label={parts.label} />
    </ActionMenu>
  );
}
