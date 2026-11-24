import type { ChannelName, TopLevelMessage } from "../../sdk/index.ts";
import { ChannelConversationPanel } from "./channel-conversation-panel.tsx";
import { ConversationMissing } from "./conversation-missing.tsx";
import type { ConversationProps } from "./conversation-parts.ts";
import type { ReactNode } from "react";
import { actionsOf } from "./conversation-parts.ts";
import { useChannelPosts } from "./use-channel-posts.ts";
import { useChannelReader } from "./use-channel-reader.ts";

interface Ends {
  readonly first: TopLevelMessage;
  readonly newest: TopLevelMessage;
}

interface ChannelConversationProps extends Omit<ConversationProps, "selected"> {
  readonly channel: ChannelName;
}

function firstOf(ends: Ends | null, post: TopLevelMessage): TopLevelMessage {
  if (ends === null) {
    return post;
  }
  return ends.first;
}

function endsOf(posts: readonly TopLevelMessage[]): Ends | null {
  let ends: Ends | null = null;
  for (const post of posts) {
    ends = { first: firstOf(ends, post), newest: post };
  }
  return ends;
}

export function ChannelConversation(props: ChannelConversationProps): ReactNode {
  const { channel } = props;
  const posts = useChannelPosts({ channel, me: props.me, unread: props.unread });
  const reader = useChannelReader({ ...props, channel });
  if (posts === null) {
    return null;
  }
  const ends = endsOf(posts);
  if (ends === null) {
    return <ConversationMissing />;
  }
  return (
    <ChannelConversationPanel
      actions={actionsOf(reader)}
      board={props.board}
      channel={channel}
      composer={props.composer}
      edge={props.edge}
      first={ends.first}
      newest={ends.newest}
      me={props.me}
      menu={props.unread.menu}
      posts={posts}
      reader={reader}
      selection={props.unread.selection({ channel, thread: null })}
    />
  );
}
