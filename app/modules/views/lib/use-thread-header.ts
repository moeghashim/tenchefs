import type { ActionMenuParts, MenuChoice } from "../../design-system/messages.tsx";
import type { ChannelName, MessageId, TopLevelMessage } from "../../sdk/index.ts";
import type { ThreadClosing, ThreadMessagesState } from "../../board/index.ts";
import { copyingLink, threadChoice } from "./use-message-menu.ts";
import { useCallback, useContext, useMemo } from "react";
import type { Announce } from "./announcer.ts";
import { Announcer } from "./announcer.ts";
import { LandingContext } from "../../landing/index.ts";
import type { MessageMenu } from "../../unread/index.ts";
import type { PanelAloneParts } from "../../design-system/layout.tsx";
import { hrefOf } from "../../paths/index.ts";

const TEXT = {
  alone: "Open thread on its own",
  back: "Back to channel",
  copyLink: "Copy link",
  markUnread: "Mark unread",
  menu: "Thread actions",
} as const;

interface ThreadHeaderOf {
  readonly alone: boolean;
  readonly channel: ChannelName;
  readonly closing: ThreadClosing;
  readonly menu: MessageMenu;
  readonly state: ThreadMessagesState;
  readonly thread: MessageId;
}

interface ThreadChoicesOf extends Omit<ThreadHeaderOf, "alone" | "state" | "thread"> {
  readonly parent: TopLevelMessage;
  readonly announce: Announce;
}

interface ThreadHeader {
  readonly alone: PanelAloneParts;
  readonly closeHref: string;
  readonly menu: ActionMenuParts | null;
  readonly onClose: () => void;
}

function threadChoices({ announce, channel, closing, menu, parent }: ThreadChoicesOf): readonly MenuChoice[] {
  const { id } = parent;
  const link = new URL(hrefOf({ channel, name: "thread", thread: id }), globalThis.location.href).href;
  const copyLink = copyingLink({ announce, link: () => link });
  function markUnread(): void {
    menu.markUnread(id);
  }
  return [
    ...[threadChoice({ announce, closing, message: parent })]
      .filter((choice) => choice !== null)
      .map((choice): MenuChoice => ({ href: null, icon: choice.icon, label: choice.label, onSelect: choice.onSelect })),
    { href: null, icon: "mark-unread", label: TEXT.markUnread, onSelect: markUnread },
    { href: null, icon: "copy-link", label: TEXT.copyLink, onSelect: copyLink },
  ];
}

function aloneLink({ alone, channel, thread }: Pick<ThreadHeaderOf, "alone" | "channel" | "thread">): PanelAloneParts {
  if (alone) {
    return { alone, href: hrefOf({ channel, name: "thread", thread }), label: TEXT.back };
  }
  return { alone, href: hrefOf({ alone: true, channel, name: "thread", thread }), label: TEXT.alone };
}

function useThreadHeader({ alone, channel, closing, menu, state, thread }: ThreadHeaderOf): ThreadHeader {
  const parent = state.status === "loaded" && state.parent;
  const announce = useContext(Announcer);
  const { watch } = useContext(LandingContext);
  const onClose = useCallback(() => {
    const opener = hrefOf({ channel, message: thread, name: "thread", thread });
    watch(`main article:has(a[href="${CSS.escape(opener)}"])`);
  }, [channel, thread, watch]);
  return useMemo(() => {
    const shown = {
      alone: aloneLink({ alone, channel, thread }),
      closeHref: hrefOf({ channel, name: "channel" }),
      onClose,
    };
    if (parent === false) {
      return { ...shown, menu: null };
    }
    return {
      ...shown,
      menu: { choices: threadChoices({ announce, channel, closing, menu, parent }), label: TEXT.menu },
    };
  }, [alone, announce, channel, closing, menu, onClose, parent, thread]);
}

export { useThreadHeader };
