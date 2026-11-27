import type { ActionMenuParts, MenuChoice } from "../../design-system/messages.tsx";
import type { InboxItem, MessageId } from "../../sdk/index.ts";
import type { InboxRow } from "../../unread/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { useMemo } from "react";

const TEXT = { label: "Inbox row actions", markRead: "Mark read", markUnread: "Mark unread", open: "Open in channel" };

interface InboxRowActions {
  readonly ack: (id: MessageId) => void;
  readonly markUnread: (id: MessageId) => void;
  readonly shortcutOf: Keymap["shortcutOf"];
}

interface InboxRowMenuOf {
  readonly actions: InboxRowActions | null;
  readonly row: InboxRow;
  readonly unread: boolean;
}

function openHrefOf({ channel, message, parent }: InboxItem): string {
  if (message.kind === "reply") {
    return hrefOf({ channel: channel.name, message: message.id, name: "thread", thread: parent.id });
  }
  return hrefOf({ channel: channel.name, name: "channel" });
}

function oldestOf(row: InboxRow): InboxItem {
  let oldest = row.latest;
  for (const item of row.items) {
    if (item.message.id < oldest.message.id) {
      oldest = item;
    }
  }
  return oldest;
}

interface ReadChoiceOf extends InboxRowMenuOf {
  readonly actions: InboxRowActions;
}

function readChoice({ actions, row, unread }: ReadChoiceOf): MenuChoice {
  if (unread) {
    return {
      href: null,
      icon: "mark-read",
      keys: actions.shortcutOf("markRowRead"),
      label: TEXT.markRead,
      onSelect: () => {
        actions.ack(row.latest.message.id);
      },
    };
  }
  return {
    href: null,
    icon: "mark-unread",
    keys: actions.shortcutOf("markRowUnread"),
    label: TEXT.markUnread,
    onSelect: () => {
      actions.markUnread(oldestOf(row).message.id);
    },
  } as const;
}

function useInboxRowMenu({ actions, row, unread }: InboxRowMenuOf): ActionMenuParts | null {
  return useMemo(() => {
    if (actions === null) {
      return null;
    }
    return {
      choices: [
        readChoice({ actions, row, unread }),
        {
          href: openHrefOf(row.latest),
          icon: "open-in-channel",
          keys: actions.shortcutOf("openRow"),
          label: TEXT.open,
          onSelect: null,
        },
      ],
      label: TEXT.label,
    };
  }, [actions, row, unread]);
}

export { type InboxRowActions, useInboxRowMenu };
