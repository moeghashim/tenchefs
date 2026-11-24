import { Alert, CardBody, ChannelStart, Skeleton } from "../../design-system/index.tsx";
import type { ChannelMessages, ChannelMessagesState, ThreadClosing } from "../../board/index.ts";
import type { ChannelName, MessageId } from "../../sdk/index.ts";
import { FeedStream } from "./feed-stream.tsx";
import { Older } from "./older.tsx";
import type { ReactNode } from "react";
import { ReadRefusal } from "./read-refusal.tsx";
import type { Unread } from "../../unread/index.ts";
import { useThreadNews } from "./use-unread-levels.ts";

const TEXT = { messages: "Messages", start: "This is the start of the channel." } as const;

interface MessageRowsProps {
  readonly channel: ChannelName;
  readonly messages: ChannelMessages;
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
  const { channel, messages, state } = props;
  const handleLoad = messages.loadOlder;
  const threads = useThreadNews({ me: props.me, unread: props.unread });
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
      {state.hasMore && <Older older={state.older} onLoad={handleLoad} />}
      {!state.hasMore && <ChannelStart description={TEXT.start} title={`Welcome to #${channel}`} />}
      <FeedStream
        closing={props.closing}
        channel={channel}
        held={props.held}
        label={TEXT.messages}
        me={props.me}
        menu={props.unread.menu}
        messages={messages}
        open={props.open}
        readPosition={props.readPosition}
        state={state}
        threads={threads}
      />
      <ReadRefusal read={state.read} />
    </>
  );
}
