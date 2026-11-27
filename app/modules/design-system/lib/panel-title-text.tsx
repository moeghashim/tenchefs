import type { MenuChoice } from "./menu-parts.ts";
import { PanelLabelled } from "./panel-labelled.tsx";
import { PanelTitled } from "./panel-titled.tsx";
import type { ReactNode } from "react";

const FOCUSABLE = 0;
const NOT_TABBABLE = -1;

interface PanelTitleTextParts {
  readonly label: string;
  readonly detail: string;
  readonly title: string | null;
  readonly focusable: boolean;
  readonly choices: readonly MenuChoice[];
}

function tabIndexOf(focusable: boolean): number {
  if (focusable) {
    return FOCUSABLE;
  }
  return NOT_TABBABLE;
}

export function PanelTitleText(parts: PanelTitleTextParts): ReactNode {
  const tabIndex = tabIndexOf(parts.focusable);
  if (parts.title !== null) {
    return <PanelTitled choices={parts.choices} detail={parts.detail} tabIndex={tabIndex} title={parts.title} />;
  }
  return <PanelLabelled choices={parts.choices} detail={parts.detail} label={parts.label} tabIndex={tabIndex} />;
}
