import type { Message, MessageId, TopLevelMessage } from "../../sdk/index.ts";
import type { MessageDeletes, ThreadClosing } from "../../board/index.ts";
import type { ReactionChoice, ThreadChoice } from "../../design-system/messages.tsx";
import { useContext, useMemo } from "react";
import type { Announce } from "./announcer.ts";
import { Announcer } from "./announcer.ts";
import type { MessageMenu } from "../../unread/index.ts";
import { createCopier } from "./copying.ts";
import { hrefOf } from "../../paths/index.ts";
import { useBoardStore } from "./use-board.ts";
import { useReactionChoices } from "./use-reactions.ts";

const TEXT = {
  close: "Close",
  closeThread: "Close thread",
  closed: "Thread closed",
  copied: "Link copied",
  copiedText: "Text copied",
  markedUnread: "Marked unread",
  reopen: "Reopen",
  reopenThread: "Reopen thread",
  reopened: "Thread reopened",
} as const;

interface MenuParts {
  readonly onMarkUnread: () => void;
  readonly onCopyLink: () => void;
  readonly onCopyText: () => void;
  readonly reactions: readonly ReactionChoice[];
  readonly thread: ThreadChoice | null;
  readonly onDelete: (() => void) | null;
}

interface MenuOf {
  readonly menu: MessageMenu;
  readonly me: string;
  readonly message: Message;
  readonly closing: ThreadClosing | null;
  readonly threadParent: TopLevelMessage | null;
}

type Reply = (name: string | null, message: Message) => void;

interface ReplyOf {
  readonly reply: Reply | null;
  readonly message: Message;
  readonly me: string;
}

interface ThreadChoiceOf {
  readonly closing: ThreadClosing | null;
  readonly message: TopLevelMessage | null;
  readonly announce: Announce;
}

function threadChoice({ announce, closing, message }: ThreadChoiceOf): ThreadChoice | null {
  if (closing === null || message === null) {
    return null;
  }
  const { id } = message;
  if ("closedAt" in message) {
    return {
      icon: "reopen",
      label: TEXT.reopen,
      name: TEXT.reopenThread,
      onSelect: () => {
        closing.reopen(id);
        announce(TEXT.reopened);
      },
    };
  }
  return {
    icon: "close",
    label: TEXT.close,
    name: TEXT.closeThread,
    onSelect: () => {
      closing.close(id);
      announce(TEXT.closed);
    },
  };
}

function threadOf(message: Message, threadParent: TopLevelMessage | null): TopLevelMessage | null {
  if (message.kind === "top-level") {
    return message;
  }
  return threadParent;
}

function threadIdOf(message: Message): MessageId {
  if (message.kind === "top-level") {
    return message.id;
  }
  return message.replyTo;
}

function linkOf(message: Message): string {
  const thread = threadIdOf(message);
  const href = hrefOf({ channel: message.channel, message: message.id, name: "thread", thread });
  return new URL(href, globalThis.location.href).href;
}

interface CopyingLink {
  readonly announce: Announce;
  readonly link: () => string;
}

function copyingLink({ announce, link }: CopyingLink): () => void {
  const copy = createCopier();
  return () => {
    copy(link());
    announce(TEXT.copied);
  };
}

function copyLinkOf(message: Message, announce: Announce): () => void {
  return copyingLink({ announce, link: () => linkOf(message) });
}

function copyTextOf(message: Message, announce: Announce): () => void {
  const copy = createCopier();
  return () => {
    copy(message.text);
    announce(TEXT.copiedText);
  };
}

interface DeleteOf {
  readonly deletes: MessageDeletes;
  readonly me: string;
  readonly message: Message;
}

function deleteOf({ deletes, me, message }: DeleteOf): (() => void) | null {
  if (message.author.name !== me) {
    return null;
  }
  return () => {
    deletes.askDelete(message);
  };
}

function useMessageMenu({ closing, me, menu, message, threadParent }: MenuOf): MenuParts {
  const messageId = message.id;
  const announce = useContext(Announcer);
  const reactions = useReactionChoices({ announce, me, message });
  const deletes = useBoardStore().calls;
  return useMemo(
    () => ({
      onCopyLink: copyLinkOf(message, announce),
      onCopyText: copyTextOf(message, announce),
      onDelete: deleteOf({ deletes, me, message }),
      onMarkUnread: () => {
        menu.markUnread(messageId);
        announce(TEXT.markedUnread);
      },
      reactions,
      thread: threadChoice({ announce, closing, message: threadOf(message, threadParent) }),
    }),
    [announce, closing, deletes, me, menu, message, messageId, reactions, threadParent],
  );
}

function mentionFor(message: Message, me: string): string | null {
  if (message.author.name === me) {
    return null;
  }
  return message.author.name;
}

function useReplyAction({ me, message, reply }: ReplyOf): (() => void) | null {
  return useMemo(() => {
    if (reply === null) {
      return null;
    }
    return () => {
      reply(mentionFor(message, me), message);
    };
  }, [me, message, reply]);
}

type MenuClosing = ThreadClosing | null;

export { copyingLink, type MenuClosing, type Reply, threadChoice, useMessageMenu, useReplyAction };
