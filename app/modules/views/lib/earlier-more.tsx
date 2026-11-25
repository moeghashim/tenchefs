import type { Earlier, EarlierState } from "../../unread/index.ts";
import { FeedNote, MoreButton } from "../../design-system/feed.tsx";
import { Alert } from "../../design-system/content.tsx";
import type { ReactNode } from "react";

const NONE = 0;

const TEXT = { end: "That's everything.", loading: "Loading…", more: "Show earlier" } as const;

interface EarlierMoreProps {
  readonly earlier: Earlier;
  readonly state: Extract<EarlierState, { readonly status: "loaded" }>;
}

function labelOf(loading: boolean): string {
  if (loading) {
    return TEXT.loading;
  }
  return TEXT.more;
}

export function EarlierMore(props: EarlierMoreProps): ReactNode {
  const { hasMore, items, more } = props.state;
  const loading = more.status === "loading";
  const handleLoadMore = props.earlier.loadMore;
  if (!hasMore) {
    return items.length > NONE && <FeedNote place="end">{TEXT.end}</FeedNote>;
  }
  return (
    <>
      <MoreButton loading={loading} onClick={handleLoadMore}>
        {labelOf(loading)}
      </MoreButton>
      {more.status === "failed" && <Alert>{`Couldn't load more (${more.code}): ${more.message}`}</Alert>}
    </>
  );
}
