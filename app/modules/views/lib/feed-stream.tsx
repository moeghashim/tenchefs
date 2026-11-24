import type { ChannelMessages, ChannelMessagesState, ThreadClosing } from "../../board/index.ts";
import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { MessageMenu, ThreadNews } from "../../unread/index.ts";
import { FoldEntry } from "./fold-entry.tsx";
import { MessageEntry } from "./message-entry.tsx";
import { MessageList } from "../../design-system/index.tsx";
import { MessageRefusals } from "./message-refusals.tsx";
import type { ReactNode } from "react";
import { feedRows } from "./feed-rows.ts";

type Loaded = Extract<ChannelMessagesState, { readonly status: "loaded" }>;

interface FeedStreamProps {
  readonly label: string;
  readonly state: Loaded;
  readonly messages: ChannelMessages;
  readonly me: string;
  readonly readPosition: number | null;
  readonly channel: ChannelName;
  readonly open: MessageId | null;
  readonly threads: ReadonlyMap<MessageId, ThreadNews>;
  readonly menu: MessageMenu;
  readonly closing: ThreadClosing;
}

export function FeedStream(props: FeedStreamProps): ReactNode {
  const { state } = props;
  const rows = feedRows({
    expanded: state.expanded,
    me: props.me,
    messages: state.messages,
    readPosition: props.readPosition,
  });
  return (
    <>
      <MessageList label={props.label}>
        {rows.map((row) => {
          if (row.kind === "fold") {
            return (
              <FoldEntry
                day={row.day}
                expanded={state.expanded}
                fold={row.fold}
                key={`fold-${row.fold.run.join("-")}`}
                messages={props.messages}
              />
            );
          }
          return (
            <MessageEntry
              closing={props.closing}
              channel={props.channel}
              key={row.row.message.id}
              me={props.me}
              menu={props.menu}
              news={props.threads.get(row.row.message.id) ?? null}
              open={props.open}
              parent={null}
              receipts={state.receipts}
              reply={null}
              row={row.row}
            />
          );
        })}
      </MessageList>
      <MessageRefusals closing={props.closing} menu={props.menu} />
    </>
  );
}
