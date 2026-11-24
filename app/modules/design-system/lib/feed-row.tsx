import { ActionMenu } from "./action-menu.tsx";
import type { ActionMenuParts } from "./menu-parts.ts";
import { FeedRowContent } from "./feed-row-content.tsx";
import type { FeedRowContentParts } from "./feed-row-content.tsx";
import type { ReactNode } from "react";

interface RowParts extends FeedRowContentParts {
  readonly menu: ActionMenuParts | null;
}

const LOOKS = {
  activity: "",
  "for-you": "",
  read: "opacity-80 hover:opacity-100",
} as const;

function rowLook(parts: RowParts): string {
  if (parts.current) {
    return `bg-accent ${LOOKS[parts.level]}`;
  }
  return LOOKS[parts.level];
}

export function FeedRow(parts: RowParts): ReactNode {
  const look = `relative flex rounded-lg has-focus-visible:ring-1 transition-colors hover:bg-hover ${rowLook(parts)}`;
  const { menu } = parts;
  if (menu === null) {
    return (
      <li className={look}>
        <FeedRowContent row={parts} />
      </li>
    );
  }
  return (
    <li className={look}>
      <ActionMenu choices={menu.choices} label={menu.label}>
        <FeedRowContent row={parts} />
      </ActionMenu>
    </li>
  );
}
