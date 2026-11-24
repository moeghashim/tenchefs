import { Avatar } from "./avatar.tsx";
import { FeedRowBody } from "./feed-row-body.tsx";
import type { FeedRowParts } from "./feed-row-body.tsx";
import type { PresenceShown } from "./avatar-parts.ts";
import type { ReactNode } from "react";

interface RowParts extends FeedRowParts {
  readonly agent: boolean;
  readonly presence: PresenceShown | null;
}

const LOOKS = {
  activity: "",
  "for-you": "",
  read: "opacity-80 hover:opacity-100",
} as const;

function rowLook(parts: RowParts): string {
  if (parts.current) {
    return `bg-accent ${LOOKS[parts.level]}`;
  }
  return LOOKS[parts.level];
}

export function FeedRow(parts: RowParts): ReactNode {
  return (
    <li
      className={`relative flex gap-3 rounded-lg has-focus-visible:ring-1 px-3 py-3 transition-colors hover:bg-hover ${rowLook(parts)}`}
    >
      <Avatar agent={parts.agent} name={parts.author} presence={parts.presence} />
      <FeedRowBody
        action={parts.action}
        author={parts.author}
        authorHref={parts.authorHref}
        channel={parts.channel}
        closed={parts.closed}
        context={parts.context}
        count={parts.count}
        current={parts.current}
        displayName={parts.displayName}
        href={parts.href}
        level={parts.level}
        note={parts.note}
        time={parts.time}
        why={parts.why}
      >
        {parts.children}
      </FeedRowBody>
    </li>
  );
}
