import type { MenuChoice, MessageActionParts, MessageMenuParts, ThreadChoice } from "./menu-parts.ts";
import type { MessageItemParts } from "./parts.ts";
import { useMemo } from "react";

const TEXT = { altClick: "Alt-click", markUnread: "Mark unread" } as const;

interface ChoicesOf extends MessageActionParts {
  readonly menu: MessageMenuParts;
}

function actionOf(parts: MessageActionParts): readonly MenuChoice[] {
  if (parts.actionHref !== null) {
    return [{ href: parts.actionHref, icon: "reply", label: parts.actionLabel, onSelect: null }];
  }
  return [parts.onAction]
    .filter((action) => action !== null)
    .map((action) => ({ href: null, icon: "reply", label: parts.actionLabel, onSelect: action }));
}

export function hoverThread(parts: Pick<MessageItemParts, "menu" | "threadOnHover">): ThreadChoice | null {
  if (!parts.threadOnHover) {
    return null;
  }
  return parts.menu.thread;
}

export function useMessageChoices({ actionHref, actionLabel, menu, onAction }: ChoicesOf): readonly MenuChoice[] {
  return useMemo(
    () => [
      ...actionOf({ actionHref, actionLabel, onAction }),
      ...menu.reactions.map(
        (choice): MenuChoice => ({
          href: null,
          icon: "react",
          label: `React with ${choice.symbol}`,
          onSelect: choice.onReact,
        }),
      ),
      { href: null, icon: "mark-unread", label: TEXT.markUnread, onSelect: menu.onMarkUnread, shortcut: TEXT.altClick },
      ...[menu.thread]
        .filter((choice) => choice !== null)
        .map((choice) => ({ href: null, icon: choice.icon, label: choice.label, onSelect: choice.onSelect })),
    ],
    [actionHref, actionLabel, menu, onAction],
  );
}
