import type { BoardStore, ChannelMessagesState } from "../../board/index.ts";
import type { IdentityName, MessageId, TopLevelMessage } from "../../sdk/index.ts";
import { channelPage, loggedInName } from "../../board/index.ts";
import { isChannelName } from "../../channels/index.ts";

interface Post {
  readonly at: MessageId;
  readonly name: IdentityName;
}

interface PostersOf {
  readonly store: Pick<BoardStore, "snapshot">;
  readonly channel: string;
}

const FIRST = 0;
const LATEST = 1;

function postsIn(message: TopLevelMessage): readonly Post[] {
  const latest = message.repliers.slice(FIRST, LATEST).map((replier) => ({
    at: message.latestReplyId ?? message.id,
    name: replier.name,
  }));
  const earlier = message.repliers.slice(LATEST).map((replier) => ({ at: message.id, name: replier.name }));
  return [...latest, ...earlier, { at: message.id, name: message.author.name }];
}

function isLoaded(state: ChannelMessagesState): state is Extract<ChannelMessagesState, { status: "loaded" }> {
  return state.status === "loaded";
}

export function channelPosters({ channel, store }: PostersOf): readonly IdentityName[] {
  const state = store.snapshot();
  const posts = [channel]
    .filter((name) => isChannelName(name))
    .map((name) => channelPage(name)(state))
    .filter((page) => isLoaded(page))
    .flatMap((page) => page.messages.flatMap((message) => postsIn(message)))
    .toSorted((one, other) => other.at - one.at);
  const me = loggedInName(state);
  return [...new Set(posts.map((post) => post.name))].filter((name) => name !== me);
}
