import type { Message, MessageId, ReadReceipt, Reply, TopLevelMessage } from "../../sdk/index.ts";
import type { MessageMenu, Selection, ThreadNews } from "../../unread/index.ts";
import { useCallback, useContext, useId, useSyncExternalStore } from "react";
import { DividerButton } from "../../design-system/controls.tsx";
import { EarlierReplies } from "./earlier-replies.tsx";
import type { Folding } from "./reply-folding.ts";
import { LandingContext } from "../../landing/index.ts";
import { MessageStream } from "./message-stream.tsx";
import type { ReactNode } from "react";
import type { Reply as ReplyAction } from "./use-message-menu.ts";
import type { ThreadClosing } from "../../board/index.ts";
import { foldedOf } from "./reply-folding.ts";

const NONE = 0;
const LAST = -1;
const NO_THREADS: ReadonlyMap<MessageId, ThreadNews> = new Map();

const plural = new Intl.PluralRules("en");
const EARLIER = { one: "earlier reply", other: "earlier replies" } as const;

interface ConversationRepliesProps {
  readonly parent: TopLevelMessage;
  readonly replies: readonly Reply[];
  readonly readPosition: number | null;
  readonly linked: MessageId | null;
  readonly kept: number;
  readonly unlined: Folding["unlined"];
  readonly label: string;
  readonly newLine: number | null;
  readonly receipts: readonly ReadReceipt[];
  readonly me: string;
  readonly menu: MessageMenu;
  readonly selection: Selection;
  readonly reply: ReplyAction;
  readonly closing: ThreadClosing;
  readonly deleted: ReadonlySet<MessageId>;
  readonly opened: boolean;
}

function earlierText(count: number): string {
  if (plural.select(count) === "one") {
    return `${String(count)} ${EARLIER.one}`;
  }
  return `${String(count)} ${EARLIER.other}`;
}

function lastOf(messages: readonly Message[], parent: Message): Message {
  return messages.at(LAST) ?? parent;
}

function firstIn(feed: string): string {
  return `[id="${feed}"] article`;
}

export function ConversationReplies(props: ConversationRepliesProps): ReactNode {
  const { me, menu, parent, receipts, selection } = props;
  const { expanded } = useSyncExternalStore(selection.subscribe, selection.snapshot);
  const { watch } = useContext(LandingContext);
  const feed = useId();
  const { earlier, shown } = foldedOf(props);
  const handleExpand = useCallback(() => {
    watch(firstIn(feed));
    selection.expand();
  }, [feed, selection, watch]);
  return (
    <>
      {earlier.length > NONE && !expanded && (
        <DividerButton onClick={handleExpand}>{earlierText(earlier.length)}</DividerButton>
      )}
      {expanded && (
        <EarlierReplies
          closing={props.closing}
          deleted={props.deleted}
          me={me}
          menu={menu}
          parent={parent}
          receipts={receipts}
          replies={earlier}
          reply={props.reply}
        />
      )}
      <MessageStream
        after={lastOf(earlier, parent)}
        closing={props.closing}
        channel={null}
        deleted={props.deleted}
        feed={feed}
        label={props.label}
        me={me}
        menu={menu}
        messages={shown}
        open={null}
        opened={props.opened}
        readPosition={props.newLine}
        receipts={receipts}
        reply={props.reply}
        threadParent={parent}
        threads={NO_THREADS}
      />
    </>
  );
}
