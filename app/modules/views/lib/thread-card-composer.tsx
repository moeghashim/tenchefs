import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { Board } from "../../board/index.ts";
import type { Composer } from "./thread-draft.ts";
import { IdentityCardComposer } from "../../design-system/index.tsx";
import type { ReactNode } from "react";
import { threadDraft } from "./thread-draft.ts";

interface ThreadCardComposerProps {
  readonly board: Board;
  readonly channel: ChannelName;
  readonly composer: Composer;
  readonly thread: MessageId;
  readonly me: string;
  readonly children: ReactNode;
}

export function ThreadCardComposer(props: ThreadCardComposerProps): ReactNode {
  const { channel, thread } = props;
  const messages = props.board.thread(channel, thread);
  const draft = threadDraft({ channel, composer: props.composer, me: props.me, messages, thread });
  return <IdentityCardComposer value={draft.replyTo}>{props.children}</IdentityCardComposer>;
}
