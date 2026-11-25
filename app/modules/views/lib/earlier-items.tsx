import { FeedList, FeedNote } from "../../design-system/feed.tsx";
import type { InboxItem } from "../../sdk/index.ts";
import { InboxRowView } from "./inbox-row-view.tsx";
import type { InboxSelection } from "../../paths/index.ts";
import type { ReactNode } from "react";
import { isSelected } from "./use-inbox-rows.ts";
import { rowsOf } from "../../unread/index.ts";
import { useMemo } from "react";

const NONE = 0;
const EMPTY = "Nothing read yet.";

interface EarlierItemsProps {
  readonly items: readonly InboxItem[];
  readonly hasMore: boolean;
  readonly label: string;
  readonly me: string;
  readonly hidden: string | null;
  readonly selected: InboxSelection | null;
}

export function EarlierItems(props: EarlierItemsProps): ReactNode {
  const { hidden, items, me, selected } = props;
  const all = useMemo(() => rowsOf({ items, me }), [items, me]);
  const rows = all.filter((row) => row.key !== hidden);
  if (all.length === NONE) {
    return !props.hasMore && <FeedNote place="empty">{EMPTY}</FeedNote>;
  }
  return (
    <FeedList label={props.label}>
      {rows.map((row) => (
        <InboxRowView
          actions={null}
          key={row.key}
          me={me}
          row={row}
          current={isSelected({ row, selected })}
          unread={false}
        />
      ))}
    </FeedList>
  );
}
