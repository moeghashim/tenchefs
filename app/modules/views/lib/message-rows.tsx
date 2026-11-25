import { Alert, Skeleton } from "../../design-system/content.tsx";
import type { ChannelMessagesState, ThreadClosing } from "../../board/index.ts";
import type { ChannelName, MessageId } from "../../sdk/index.ts";
import { CardBody } from "../../design-system/layout.tsx";
import { ChannelTop } from "./channel-top.tsx";
import { FeedStream } from "./feed-stream.tsx";
import type { ReactNode } from "react";
import { ReadRefusal } from "./read-refusal.tsx";
import type { Unread } from "../../unread/index.ts";
import { useId } from "react";
import { useThreadNews } from "./use-unread-levels.ts";

const TEXT = { messages: "Messages" } as const;

interface MessageRowsProps {
  readonly channel: ChannelName;
  readonly state: ChannelMessagesState;
  readonly me: string;
  readonly held: ReadonlySet<MessageId>;
  readonly open: MessageId | null;
  readonly readPosition: number | null;
  readonly unread: Unread;
  readonly closing: ThreadClosing;
}

export type { MessageRowsProps };

export function MessageRows(props: MessageRowsProps): ReactNode {
  const { channel, state } = props;
  const threads = useThreadNews({ me: props.me, unread: props.unread });
  const feed = useId();
  if (state.status === "loading") {
    return (
      <CardBody>
        <Skeleton width="short" />
        <Skeleton width="long" />
      </CardBody>
    );
  }
  if (state.status === "failed") {
    return <Alert>{`Couldn't load the messages (${state.code}): ${state.message}`}</Alert>;
  }
  return (
    <>
      <ChannelTop channel={channel} feed={feed} state={state} />
      <FeedStream
        closing={props.closing}
        channel={channel}
        held={props.held}
        feed={feed}
        label={TEXT.messages}
        me={props.me}
        menu={props.unread.menu}
        open={props.open}
        readPosition={props.readPosition}
        state={state}
        threads={threads}
      />
      <ReadRefusal read={state.read} />
    </>
  );
}
