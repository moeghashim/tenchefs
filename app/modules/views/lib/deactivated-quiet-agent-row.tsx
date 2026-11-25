import type { DeactivatedQuietAgent } from "../../sdk/index.ts";
import { FeedNoticeRow } from "../../design-system/feed.tsx";
import type { ReactNode } from "react";
import { useAuthor } from "./use-author.ts";
import { useTimeAgo } from "./use-time-ago.ts";

interface DeactivatedQuietAgentRowProps {
  readonly entry: DeactivatedQuietAgent;
  readonly children?: ReactNode;
}

function levelOf(read: boolean): "for-you" | "read" {
  if (read) {
    return "read";
  }
  return "for-you";
}

export function DeactivatedQuietAgentRow(props: DeactivatedQuietAgentRowProps): ReactNode {
  const { entry } = props;
  const { agent, displayName, note, presence, profileHref } = useAuthor(entry.identity);
  const time = useTimeAgo(entry.deactivatedAt);
  return (
    <FeedNoticeRow
      agent={agent}
      displayName={displayName}
      href={profileHref}
      level={levelOf(entry.read)}
      name={entry.identity.name}
      note={note}
      presence={presence}
      time={time}
      why={entry.text}
    >
      {props.children}
    </FeedNoticeRow>
  );
}
