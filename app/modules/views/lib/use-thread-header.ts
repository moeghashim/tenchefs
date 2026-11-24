import type { ActionMenuParts, MenuChoice } from "../../design-system/index.tsx";
import type { ChannelName, TopLevelMessage } from "../../sdk/index.ts";
import type { ThreadClosing, ThreadMessagesState } from "../../board/index.ts";
import type { MessageMenu } from "../../unread/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { threadChoice } from "./use-message-menu.ts";
import { useMemo } from "react";

const TEXT = { copyLink: "Copy link", markUnread: "Mark unread", menu: "Thread actions" } as const;

interface ThreadHeaderOf {
  readonly channel: ChannelName;
  readonly closing: ThreadClosing;
  readonly menu: MessageMenu;
  readonly state: ThreadMessagesState;
}

interface ThreadChoicesOf extends Omit<ThreadHeaderOf, "state"> {
  readonly parent: TopLevelMessage;
}

interface ThreadHeader {
  readonly closeHref: string;
  readonly menu: ActionMenuParts | null;
}

async function copyAfter(previous: Promise<void>, text: string): Promise<void> {
  await previous;
  await globalThis.navigator.clipboard.writeText(text);
}

function threadChoices({ channel, closing, menu, parent }: ThreadChoicesOf): readonly MenuChoice[] {
  const { id } = parent;
  const link = new URL(hrefOf({ channel, name: "thread", thread: id }), globalThis.location.href).href;
  let copying = Promise.resolve();
  function copyLink(): void {
    copying = copyAfter(copying, link);
  }
  function markUnread(): void {
    menu.markUnread(id);
  }
  return [
    ...[threadChoice({ closing, message: parent })]
      .filter((choice) => choice !== null)
      .map((choice): MenuChoice => ({ href: null, icon: choice.icon, label: choice.label, onSelect: choice.onSelect })),
    { href: null, icon: "mark-unread", label: TEXT.markUnread, onSelect: markUnread },
    { href: null, icon: "copy-link", label: TEXT.copyLink, onSelect: copyLink },
  ];
}

function useThreadHeader({ channel, closing, menu, state }: ThreadHeaderOf): ThreadHeader {
  const parent = state.status === "loaded" && state.parent;
  return useMemo(() => {
    const closeHref = hrefOf({ channel, name: "channel" });
    if (parent === false) {
      return { closeHref, menu: null };
    }
    return { closeHref, menu: { choices: threadChoices({ channel, closing, menu, parent }), label: TEXT.menu } };
  }, [channel, closing, menu, parent]);
}

export { useThreadHeader };
