import type { Message, MessageId, ReadReceipt, Reply, TopLevelMessage } from "../../sdk/index.ts";
import type { MessageMenu } from "../../unread/index.ts";
import { PostReplies } from "./post-replies.tsx";
import { PostStream } from "./post-stream.tsx";
import type { ReactNode } from "react";
import type { Reply as ReplyAction } from "./use-message-menu.ts";
import { useMemo } from "react";

const TEXT = { later: "Later posts", posts: "Posts" } as const;
const NONE = 0;

interface ChannelPostStreamsProps {
  readonly before: TopLevelMessage | null;
  readonly posts: readonly TopLevelMessage[];
  readonly receipts: readonly ReadReceipt[];
  readonly post: Message;
  readonly replies: readonly Reply[];
  readonly replyReceipts: readonly ReadReceipt[];
  readonly me: string;
  readonly menu: MessageMenu;
  readonly reply: ReplyAction;
}

function shownOf(before: TopLevelMessage | null, posts: readonly TopLevelMessage[]): readonly TopLevelMessage[] {
  if (before === null) {
    return posts;
  }
  return [before, ...posts];
}

function idOf(message: TopLevelMessage | null): MessageId | null {
  if (message === null) {
    return null;
  }
  return message.id;
}

export function ChannelPostStreams(props: ChannelPostStreamsProps): ReactNode {
  const { before, me, menu, post, receipts } = props;
  const shown = useMemo(() => shownOf(before, props.posts), [before, props.posts]);
  const readPosition = idOf(before);
  const upTo = useMemo(() => shown.filter((message) => message.id <= post.id), [shown, post]);
  const later = useMemo(() => shown.filter((message) => message.id > post.id), [shown, post]);
  return (
    <>
      <PostStream
        after={null}
        label={TEXT.posts}
        me={me}
        menu={menu}
        messages={upTo}
        readPosition={readPosition}
        receipts={receipts}
        reply={props.reply}
      />
      {props.replies.length > NONE && (
        <PostReplies me={me} menu={menu} post={post} receipts={props.replyReceipts} replies={props.replies} />
      )}
      {later.length > NONE && (
        <PostStream
          after={post}
          label={TEXT.later}
          me={me}
          menu={menu}
          messages={later}
          readPosition={readPosition}
          receipts={receipts}
          reply={props.reply}
        />
      )}
    </>
  );
}
