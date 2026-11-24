import { FeedRow, FeedText } from "../../design-system/index.tsx";
import type { Nudge } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { firstLineOf } from "./first-line.ts";
import { hrefOf } from "../../paths/index.ts";
import { useAuthor } from "./use-author.ts";
import { useTimeAgo } from "./use-time-ago.ts";

const ACTION = "started a thread in";

interface NudgeRowProps {
  readonly nudge: Nudge;
  readonly unread: boolean;
  readonly children?: ReactNode;
}

function levelOf(unread: boolean): "for-you" | "read" {
  if (unread) {
    return "for-you";
  }
  return "read";
}

export function NudgeRow(props: NudgeRowProps): ReactNode {
  const { nudge } = props;
  const { parent } = nudge;
  const { agent, displayName, note, presence, profileHref } = useAuthor(parent.author);
  const time = useTimeAgo(nudge.raisedAt);
  return (
    <FeedRow
      action={ACTION}
      agent={agent}
      author={parent.author.name}
      authorHref={profileHref}
      channel={nudge.channel.name}
      closed={false}
      context={null}
      current={false}
      count={null}
      displayName={displayName}
      href={hrefOf({ channel: nudge.channel.name, name: "thread", thread: parent.id })}
      level={levelOf(props.unread)}
      menu={null}
      note={note}
      presence={presence}
      time={time}
      why={nudge.text}
    >
      <FeedText unread={props.unread}>{firstLineOf(parent.text)}</FeedText>
      {props.children}
    </FeedRow>
  );
}
