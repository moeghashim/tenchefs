import { FeedRowClosed } from "../../design-system/feed.tsx";
import type { Message } from "../../sdk/index.ts";
import { MessageContent } from "./message-content.tsx";
import type { ReactNode } from "react";
import { ReplySummary } from "./reply-summary.tsx";
import { ScheduledMarker } from "./scheduled-marker.tsx";
import type { ThreadNews } from "../../unread/index.ts";
import { threadSummaryOf } from "./message-marks.ts";

interface MessageEntryBodyProps {
  readonly me: string;
  readonly message: Message;
  readonly closed: boolean;
  readonly href: string | null;
  readonly news: ThreadNews | null;
  readonly opened: boolean;
}

export function MessageEntryBody(props: MessageEntryBodyProps): ReactNode {
  const { href } = props;
  const summary = threadSummaryOf(props.message);
  return (
    <>
      <MessageContent me={props.me} message={props.message} opened={props.opened} />
      <ScheduledMarker message={props.message} />
      <FeedRowClosed closed={props.closed} />
      {href !== null && summary !== null && <ReplySummary href={href} news={props.news} summary={summary} />}
    </>
  );
}
