import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { Composer } from "./thread-draft.ts";
import { IdentityCardComposer } from "../../design-system/messages.tsx";
import type { ReactNode } from "react";
import { threadDraft } from "./thread-draft.ts";
import { useThreadRead } from "./use-board.ts";

interface ThreadCardComposerProps {
  readonly channel: ChannelName;
  readonly composer: Composer;
  readonly thread: MessageId;
  readonly me: string;
  readonly children: ReactNode;
}

export function ThreadCardComposer(props: ThreadCardComposerProps): ReactNode {
  const { channel, thread } = props;
  const messages = useThreadRead({ acking: false, place: { channel, id: thread } });
  const draft = threadDraft({ channel, composer: props.composer, me: props.me, messages, thread });
  return <IdentityCardComposer value={draft.replyTo}>{props.children}</IdentityCardComposer>;
}
