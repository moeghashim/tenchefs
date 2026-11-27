import type { ChannelMessagesState, ThreadClosing } from "../../board/index.ts";
import type { ChannelName, MessageId } from "../../sdk/index.ts";
import { DeletedMessage, MessageList } from "../../design-system/messages.tsx";
import type { MessageMenu, ThreadNews } from "../../unread/index.ts";
import { FoldEntry } from "./fold-entry.tsx";
import { MessageEntry } from "./message-entry.tsx";
import { MessageRefusals } from "./message-refusals.tsx";
import type { ReactNode } from "react";
import type { Reply } from "./use-message-menu.ts";
import { feedRows } from "./feed-rows.ts";

type Loaded = Extract<ChannelMessagesState, { readonly status: "loaded" }>;

interface FeedStreamProps {
  readonly label: string;
  readonly feed: string;
  readonly state: Loaded;
  readonly me: string;
  readonly held: ReadonlySet<MessageId>;
  readonly readPosition: number | null;
  readonly channel: ChannelName;
  readonly open: MessageId | null;
  readonly threads: ReadonlyMap<MessageId, ThreadNews>;
  readonly menu: MessageMenu;
  readonly closing: ThreadClosing;
  readonly reply: Reply;
}

export type { FeedStreamProps };

export function FeedStream(props: FeedStreamProps): ReactNode {
  const { state } = props;
  const rows = feedRows({ ...props, expanded: state.expanded, messages: state.messages });
  return (
    <>
      <MessageList busy={state.older.status === "loading"} feed={props.feed} label={props.label} more={state.hasMore}>
        {rows.map((row) => {
          if (row.kind === "fold") {
            return (
              <FoldEntry
                day={row.day}
                expanded={state.expanded}
                fold={row.fold}
                channel={props.channel}
                key={`fold-${row.fold.run.join("-")}`}
                open={props.open}
              />
            );
          }
          if (state.deleted.has(row.row.message.id)) {
            return <DeletedMessage key={row.row.message.id} />;
          }
          return (
            <MessageEntry
              closing={props.closing}
              closed={"closedAt" in row.row.message}
              channel={props.channel}
              key={row.row.message.id}
              me={props.me}
              menu={props.menu}
              news={props.threads.get(row.row.message.id) ?? null}
              open={props.open}
              opened={false}
              parent={null}
              threadParent={null}
              receipts={state.receipts}
              reply={props.reply}
              row={row.row}
              spaced
              titled
            />
          );
        })}
      </MessageList>
      <MessageRefusals closing={props.closing} menu={props.menu} />
    </>
  );
}
