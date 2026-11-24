import type { ReactionChoice, ThreadChoice } from "../../design-system/index.tsx";
import type { Message } from "../../sdk/index.ts";
import type { MessageMenu } from "../../unread/index.ts";
import type { ThreadClosing } from "../../board/index.ts";
import { useMemo } from "react";
import { useReactionChoices } from "./use-reactions.ts";

const TEXT = { close: "Close", closeThread: "Close thread", reopen: "Reopen", reopenThread: "Reopen thread" } as const;

interface MenuParts {
  readonly onMarkUnread: () => void;
  readonly reactions: readonly ReactionChoice[];
  readonly thread: ThreadChoice | null;
}

interface MenuOf {
  readonly menu: MessageMenu;
  readonly me: string;
  readonly message: Message;
  readonly closing: ThreadClosing | null;
}

type Reply = (name: string | null, message: Message) => void;

interface ReplyOf {
  readonly reply: Reply | null;
  readonly message: Message;
  readonly me: string;
}

function threadChoice(closing: ThreadClosing | null, message: Message): ThreadChoice | null {
  if (closing === null || message.kind !== "top-level") {
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
      },
    };
  }
  return {
    icon: "close",
    label: TEXT.close,
    name: TEXT.closeThread,
    onSelect: () => {
      closing.close(id);
    },
  };
}

function useMessageMenu({ closing, me, menu, message }: MenuOf): MenuParts {
  const messageId = message.id;
  const reactions = useReactionChoices({ me, message });
  return useMemo(
    () => ({
      onMarkUnread: () => {
        menu.markUnread(messageId);
      },
      reactions,
      thread: threadChoice(closing, message),
    }),
    [closing, menu, message, messageId, reactions],
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

export { type MenuClosing, type Reply, useMessageMenu, useReplyAction };
