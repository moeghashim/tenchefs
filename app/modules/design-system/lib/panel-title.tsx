import type { ActionMenuParts, MenuChoice } from "./menu-parts.ts";
import { ActionMenu } from "./action-menu.tsx";
import { PanelTitleText } from "./panel-title-text.tsx";
import type { ReactNode } from "react";

const NO_CHOICES: readonly MenuChoice[] = [];

interface PanelTitleParts {
  readonly label: string;
  readonly detail: string;
  readonly title: string | null;
  readonly menu: ActionMenuParts | null;
}

export function PanelTitle(parts: PanelTitleParts): ReactNode {
  const { menu } = parts;
  if (menu === null) {
    return (
      <PanelTitleText
        choices={NO_CHOICES}
        detail={parts.detail}
        focusable={false}
        label={parts.label}
        title={parts.title}
      />
    );
  }
  return (
    <ActionMenu choices={menu.choices} label={menu.label}>
      <PanelTitleText choices={menu.choices} detail={parts.detail} focusable label={parts.label} title={parts.title} />
    </ActionMenu>
  );
}
