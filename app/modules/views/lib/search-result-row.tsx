import { FeedRow, FeedText } from "../../design-system/index.tsx";
import type { ParsedQuery } from "../../search/index.ts";
import type { ReactNode } from "react";
import type { SearchResult } from "../../sdk/index.ts";
import { SearchText } from "./search-text.tsx";
import { searchHrefOf } from "./use-search-box.ts";
import { useAuthor } from "./use-author.ts";
import { useTimeAgo } from "./use-time-ago.ts";

const ACTIONS = { reply: "replied in a thread in", "top-level": "posted in" } as const;
const KINDS = { reply: "Reply", "top-level": "Message" } as const;

interface SearchResultRowProps {
  readonly result: SearchResult;
  readonly query: ParsedQuery;
  readonly current: boolean;
}

export function SearchResultRow(props: SearchResultRowProps): ReactNode {
  const { message, threadClosed } = props.result;
  const { agent, displayName, note, presence, profileHref } = useAuthor(message.author);
  return (
    <FeedRow
      action={ACTIONS[message.kind]}
      agent={agent}
      author={message.author.name}
      authorHref={profileHref}
      channel={message.channel}
      closed={threadClosed}
      context={null}
      count={null}
      current={props.current}
      displayName={displayName}
      href={searchHrefOf(props.result)}
      level="activity"
      menu={null}
      note={note}
      presence={presence}
      time={useTimeAgo(message.createdAt)}
      why={KINDS[message.kind]}
    >
      <FeedText unread>
        <SearchText query={props.query} text={message.text} />
      </FeedText>
    </FeedRow>
  );
}
