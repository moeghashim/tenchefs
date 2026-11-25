import type { DeactivationOffer } from "../../sdk/index.ts";
import { FeedNoticeRow } from "../../design-system/feed.tsx";
import type { ReactNode } from "react";
import { useAuthor } from "./use-author.ts";
import { useTimeAgo } from "./use-time-ago.ts";

interface OfferRowProps {
  readonly offer: DeactivationOffer;
  readonly open: boolean;
  readonly children?: ReactNode;
}

function levelOf(open: boolean): "for-you" | "read" {
  if (open) {
    return "for-you";
  }
  return "read";
}

export function OfferRow(props: OfferRowProps): ReactNode {
  const { offer } = props;
  const { agent, displayName, note, presence, profileHref } = useAuthor(offer.identity);
  const time = useTimeAgo(offer.raisedAt);
  return (
    <FeedNoticeRow
      agent={agent}
      displayName={displayName}
      href={profileHref}
      level={levelOf(props.open)}
      name={offer.identity.name}
      note={note}
      presence={presence}
      time={time}
      why={offer.text}
    >
      {props.children}
    </FeedNoticeRow>
  );
}
