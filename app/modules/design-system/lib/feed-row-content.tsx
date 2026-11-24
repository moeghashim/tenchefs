import { Avatar } from "./avatar.tsx";
import { FeedRowBody } from "./feed-row-body.tsx";
import type { FeedRowParts } from "./feed-row-body.tsx";
import type { PresenceShown } from "./avatar-parts.ts";
import type { ReactNode } from "react";

interface FeedRowContentParts extends FeedRowParts {
  readonly agent: boolean;
  readonly presence: PresenceShown | null;
}

interface FeedRowContentOf {
  readonly row: FeedRowContentParts;
}

export function FeedRowContent({ row }: FeedRowContentOf): ReactNode {
  return (
    <span className="flex min-w-0 flex-1 gap-3 px-3 py-3">
      <Avatar agent={row.agent} name={row.author} presence={row.presence} />
      <FeedRowBody
        action={row.action}
        author={row.author}
        authorHref={row.authorHref}
        channel={row.channel}
        closed={row.closed}
        context={row.context}
        count={row.count}
        current={row.current}
        displayName={row.displayName}
        href={row.href}
        level={row.level}
        note={row.note}
        time={row.time}
        why={row.why}
      >
        {row.children}
      </FeedRowBody>
    </span>
  );
}

export type { FeedRowContentParts };
