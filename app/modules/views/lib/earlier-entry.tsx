import { AlertRow } from "./alert-row.tsx";
import type { EarlierEntry } from "./earlier-order.ts";
import { InboxRowView } from "./inbox-row-view.tsx";
import type { InboxSelection } from "../../paths/index.ts";
import type { ReactNode } from "react";
import { isSelected } from "./use-inbox-rows.ts";

interface EarlierEntryProps {
  readonly entry: EarlierEntry;
  readonly me: string;
  readonly selected: InboxSelection | null;
}

export function EarlierEntryView(props: EarlierEntryProps): ReactNode {
  const { entry } = props;
  if (entry.kind === "alert") {
    return <AlertRow alert={entry.alert} />;
  }
  return (
    <InboxRowView
      actions={null}
      me={props.me}
      row={entry.row}
      current={isSelected({ row: entry.row, selected: props.selected })}
      unread={false}
    />
  );
}
