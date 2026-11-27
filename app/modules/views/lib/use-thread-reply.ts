import type { ChannelName, Message } from "../../sdk/index.ts";
import { threadRead, useBoardStore } from "./use-board.ts";
import type { Composer } from "./thread-draft.ts";
import type { Reply } from "./use-message-menu.ts";
import { threadDraft } from "./thread-draft.ts";
import { useCallback } from "react";

interface ThreadReplyOf {
  readonly channel: ChannelName;
  readonly composer: Composer;
  readonly me: string;
}

export function useThreadReply({ channel, composer, me }: ThreadReplyOf): Reply {
  const store = useBoardStore();
  return useCallback(
    (name: string | null, message: Message) => {
      const place = { channel, id: message.id };
      const messages = threadRead({ acking: false, place, store });
      threadDraft({ channel, composer, me, messages, thread: message.id }).replyTo(name);
    },
    [channel, composer, me, store],
  );
}
