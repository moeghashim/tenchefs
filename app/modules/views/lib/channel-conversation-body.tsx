import type { Message, ReadReceipt, Reply, TopLevelMessage } from "../../sdk/index.ts";
import { CardBody } from "../../design-system/layout.tsx";
import { ChannelConversationFailed } from "./channel-conversation-failed.tsx";
import { ChannelPostStreams } from "./channel-post-streams.tsx";
import type { MessageBeforeState } from "../../board/index.ts";
import type { MessageMenu } from "../../unread/index.ts";
import type { ReactNode } from "react";
import type { Reply as ReplyAction } from "./use-message-menu.ts";
import { Skeleton } from "../../design-system/content.tsx";

interface ChannelConversationBodyProps {
  readonly state: MessageBeforeState;
  readonly posts: readonly TopLevelMessage[];
  readonly me: string;
  readonly menu: MessageMenu;
  readonly post: Message;
  readonly replies: readonly Reply[];
  readonly replyReceipts: readonly ReadReceipt[];
  readonly reply: ReplyAction;
}

export function ChannelConversationBody(props: ChannelConversationBodyProps): ReactNode {
  const { state } = props;
  if (state.status === "loading") {
    return (
      <CardBody>
        <Skeleton width="short" />
        <Skeleton width="long" />
      </CardBody>
    );
  }
  if (state.status === "failed") {
    return <ChannelConversationFailed refusal={state} />;
  }
  return (
    <ChannelPostStreams
      before={state.message}
      me={props.me}
      menu={props.menu}
      post={props.post}
      posts={props.posts}
      receipts={state.receipts}
      replies={props.replies}
      reply={props.reply}
      replyReceipts={props.replyReceipts}
    />
  );
}
