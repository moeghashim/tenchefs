import { CheckCircleIcon } from "./check-circle-icon.tsx";
import type { ReactNode } from "react";
import { ReplyIcon } from "./reply-icon.tsx";
import { RotateIcon } from "./rotate-icon.tsx";
import { SmileIcon } from "./smile-icon.tsx";
import { UnreadIcon } from "./unread-icon.tsx";
import { createElement } from "react";

const MENU_ICONS = {
  close: CheckCircleIcon,
  "mark-unread": UnreadIcon,
  react: SmileIcon,
  reopen: RotateIcon,
  reply: ReplyIcon,
} as const satisfies Readonly<Record<string, () => ReactNode>>;

export type MenuIcon = keyof typeof MENU_ICONS;

export function menuIcon(icon: MenuIcon): ReactNode {
  return createElement(MENU_ICONS[icon]);
}
