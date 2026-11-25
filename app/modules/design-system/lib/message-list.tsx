import type { FeedParts } from "./parts.ts";
import type { ReactNode } from "react";
import { useId } from "react";
import { useRovingFeed } from "./use-roving-feed.ts";

export function MessageList(parts: FeedParts): ReactNode {
  const own = useId();
  const feed = parts.feed ?? own;
  useRovingFeed({ feed, more: parts.more });
  return (
    <div aria-busy={parts.busy} aria-label={parts.label} className="flex flex-col" id={feed} role="feed">
      {parts.children}
    </div>
  );
}
