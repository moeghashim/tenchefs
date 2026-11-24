import type { Message, MessageId, ReadReceipt, Reply, TopLevelMessage } from "../../sdk/index.ts";
import type { MessageMenu, Selection, ThreadNews } from "../../unread/index.ts";
import { useMemo, useSyncExternalStore } from "react";
import { DividerButton } from "../../design-system/index.tsx";
import { MessageStream } from "./message-stream.tsx";
import type { ReactNode } from "react";
import type { Reply as ReplyAction } from "./use-message-menu.ts";

const NONE = 0;
const LAST = -1;
const NO_THREADS: ReadonlyMap<MessageId, ThreadNews> = new Map();

const TEXT = { earlier: "Earlier replies", unread: "Unread replies" } as const;

const plural = new Intl.PluralRules("en");
const EARLIER = { one: "earlier reply", other: "earlier replies" } as const;

interface ConversationRepliesProps {
  readonly parent: TopLevelMessage;
  readonly replies: readonly Reply[];
  readonly readPosition: number | null;
  readonly linked: MessageId | null;
  readonly receipts: readonly ReadReceipt[];
  readonly me: string;
  readonly menu: MessageMenu;
  readonly selection: Selection;
  readonly reply: ReplyAction;
}

function earlierText(count: number): string {
  if (plural.select(count) === "one") {
    return `${String(count)} ${EARLIER.one}`;
  }
  return `${String(count)} ${EARLIER.other}`;
}

interface Folding {
  readonly readPosition: number | null;
  readonly linked: MessageId | null;
}

function isFolded(reply: Reply, { linked, readPosition }: Folding): boolean {
  return readPosition !== null && reply.id <= readPosition && (linked === null || reply.id < linked);
}

function lastOf(messages: readonly Message[], parent: Message): Message {
  return messages.at(LAST) ?? parent;
}

export function ConversationReplies(props: ConversationRepliesProps): ReactNode {
  const { linked, me, menu, parent, readPosition, receipts, replies, selection } = props;
  const { expanded } = useSyncExternalStore(selection.subscribe, selection.snapshot);
  const handleExpand = selection.expand;
  const earlier = useMemo(
    () => replies.filter((reply) => isFolded(reply, { linked, readPosition })),
    [replies, linked, readPosition],
  );
  const unread = useMemo(
    () => replies.filter((reply) => !isFolded(reply, { linked, readPosition })),
    [replies, linked, readPosition],
  );
  return (
    <>
      {earlier.length > NONE && !expanded && (
        <DividerButton onClick={handleExpand}>{earlierText(earlier.length)}</DividerButton>
      )}
      {expanded && (
        <MessageStream
          after={parent}
          channel={null}
          label={TEXT.earlier}
          me={me}
          menu={menu}
          messages={earlier}
          open={null}
          readPosition={null}
          receipts={receipts}
          reply={props.reply}
          threads={NO_THREADS}
        />
      )}
      <MessageStream
        after={lastOf(earlier, parent)}
        channel={null}
        label={TEXT.unread}
        me={me}
        menu={menu}
        messages={unread}
        open={null}
        readPosition={null}
        receipts={receipts}
        reply={props.reply}
        threads={NO_THREADS}
      />
    </>
  );
}
