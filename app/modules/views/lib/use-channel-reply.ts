import type { ChannelName, Message, TopLevelMessage } from "../../sdk/index.ts";
import type { MessageBeforeState, ThreadMessagesState } from "../../board/index.ts";
import { threadRead, useBoardStore, useMessageBefore, useShownThread } from "./use-board.ts";
import { useCallback, useSyncExternalStore } from "react";
import type { Composer } from "./thread-draft.ts";
import type { Draft } from "../../composer/index.ts";
import type { Selection } from "../../unread/index.ts";
import { threadDraft } from "./thread-draft.ts";

interface ChannelReplyOf {
  readonly composer: Composer;
  readonly channel: ChannelName;
  readonly selection: Selection;
  readonly first: TopLevelMessage;
  readonly newest: TopLevelMessage;
  readonly me: string;
  readonly replied: () => void;
}

interface ChannelReply {
  readonly before: MessageBeforeState;
  readonly post: Message;
  readonly state: ThreadMessagesState;
  readonly draft: Draft;
  readonly field: string;
  readonly onReply: (name: string | null, message: Message) => void;
  readonly replied: () => void;
}

export function useChannelReply({
  channel,
  composer,
  first,
  me,
  newest,
  replied,
  selection,
}: ChannelReplyOf): ChannelReply {
  const { replyPost } = useSyncExternalStore(selection.subscribe, selection.snapshot);
  const post = replyPost ?? newest;
  const store = useBoardStore();
  const { read: messages, state } = useShownThread({ acking: false, place: { channel, id: post.id } });
  const draft = threadDraft({ channel, composer, me, messages, thread: post.id });
  const onReply = useCallback(
    (_name: string | null, message: Message) => {
      selection.chooseReplyPost(message);
      const chosen = threadRead({ acking: false, place: { channel, id: message.id }, store });
      threadDraft({ channel, composer, me, messages: chosen, thread: message.id }).replyTo(null);
    },
    [channel, composer, me, selection, store],
  );
  return {
    before: useMessageBefore({ channel, id: first.id }),
    draft,
    field: `Reply to @${post.author.name}`,
    onReply,
    post,
    replied,
    state,
  };
}

export type { Composer } from "./thread-draft.ts";
