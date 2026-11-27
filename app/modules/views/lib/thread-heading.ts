import type { ChannelName } from "../../sdk/index.ts";
import type { ThreadMessagesState } from "../../board/index.ts";

const NO_REPLIES = 0;
const ONE_REPLY = 1;

interface ThreadHeading {
  readonly title: string | null;
  readonly detail: string;
}

function repliesOf(count: number): string {
  if (count === ONE_REPLY) {
    return " · 1 reply";
  }
  if (count === NO_REPLIES) {
    return "";
  }
  return ` · ${String(count)} replies`;
}

interface HeadingOf {
  readonly channel: ChannelName;
  readonly state: ThreadMessagesState;
}

function threadHeading({ channel, state }: HeadingOf): ThreadHeading {
  const untitled = { detail: `#${channel}`, title: null };
  if (state.status !== "loaded") {
    return untitled;
  }
  const { replyCount, title } = state.parent;
  if (typeof title !== "string") {
    return untitled;
  }
  return { detail: `Thread · #${channel}${repliesOf(replyCount)}`, title };
}

export { threadHeading };
