import type { MenuChoice, MessageActionParts, MessageMenuParts, ThreadChoice } from "./menu-parts.ts";
import { useContext, useMemo } from "react";
import type { MessageItemParts } from "./message-parts.ts";
import { MessageKeys } from "./message-keys-parts.ts";
import type { MessageShortcuts } from "./message-keys-parts.ts";

const TEXT = { copyLink: "Copy link", markUnread: "Mark unread", openThread: "Open thread" } as const;

interface ChoicesOf extends MessageActionParts {
  readonly menu: MessageMenuParts;
}

interface Keyed {
  readonly parts: MessageActionParts;
  readonly keys: MessageShortcuts;
}

function actionOf({ keys, parts }: Keyed): readonly MenuChoice[] {
  const { actionHref, actionLabel, onAction } = parts;
  if (actionHref !== null) {
    return [{ href: actionHref, icon: "reply", keys: keys.reply, label: actionLabel, onSelect: null }];
  }
  if (onAction === null) {
    return [];
  }
  return [{ href: null, icon: "reply", keys: keys.reply, label: actionLabel, onSelect: onAction }];
}

function openThreadOf({ keys, parts }: Keyed): readonly MenuChoice[] {
  if (parts.threadHref === null) {
    return [];
  }
  return [
    { href: parts.threadHref, icon: "open-thread", keys: keys.openThread, label: TEXT.openThread, onSelect: null },
  ];
}

export function hoverThread(parts: Pick<MessageItemParts, "menu" | "threadOnHover">): ThreadChoice | null {
  if (!parts.threadOnHover) {
    return null;
  }
  return parts.menu.thread;
}

export function useMessageChoices({
  actionHref,
  actionLabel,
  menu,
  onAction,
  threadHref,
}: ChoicesOf): readonly MenuChoice[] {
  const keys = useContext(MessageKeys);
  return useMemo(
    () => [
      ...actionOf({ keys, parts: { actionHref, actionLabel, onAction, threadHref } }),
      ...openThreadOf({ keys, parts: { actionHref, actionLabel, onAction, threadHref } }),
      ...menu.reactions.map(
        (choice): MenuChoice => ({
          href: null,
          icon: "react",
          keys: { keys: choice.key, label: choice.key },
          label: `React with ${choice.symbol}`,
          onSelect: choice.onReact,
        }),
      ),
      { href: null, icon: "mark-unread", keys: keys.markUnread, label: TEXT.markUnread, onSelect: menu.onMarkUnread },
      { href: null, icon: "copy-link", keys: keys.copyLink, label: TEXT.copyLink, onSelect: menu.onCopyLink },
      ...[menu.thread]
        .filter((choice) => choice !== null)
        .map(
          (choice): MenuChoice => ({
            href: null,
            icon: choice.icon,
            keys: keys.thread,
            label: choice.label,
            onSelect: choice.onSelect,
          }),
        ),
    ],
    [actionHref, actionLabel, keys, menu, onAction, threadHref],
  );
}
