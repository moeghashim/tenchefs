import { CHANNEL_MENU_ICONS } from "./channel-menu-icons.ts";
import { PERSON_MENU_ICONS } from "./person-menu-icons.ts";
import type { ReactNode } from "react";
import { ReadIcon } from "./read-icon.tsx";
import { ReplyIcon } from "./reply-icon.tsx";
import { SmileIcon } from "./smile-icon.tsx";
import { THREAD_MENU_ICONS } from "./thread-menu-icons.ts";
import { UnreadIcon } from "./unread-icon.tsx";
import { createElement } from "react";

const MENU_ICONS = {
  "mark-read": ReadIcon,
  "mark-unread": UnreadIcon,
  react: SmileIcon,
  reply: ReplyIcon,
  ...PERSON_MENU_ICONS,
  ...CHANNEL_MENU_ICONS,
  ...THREAD_MENU_ICONS,
} as const satisfies Readonly<Record<string, () => ReactNode>>;

export type MenuIcon = keyof typeof MENU_ICONS;

export function menuIcon(icon: MenuIcon): ReactNode {
  return createElement(MENU_ICONS[icon]);
}
