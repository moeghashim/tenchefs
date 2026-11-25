import type { Unread, UnreadState } from "../../unread/index.ts";
import { DeletedNotice } from "./deleted-notice.tsx";
import { MarkAllRead } from "./mark-all-read.tsx";
import { PaneHeader } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";

const DESCRIPTION = "Mentions, threads you follow, and channels you subscribe to";

interface InboxHeaderProps {
  readonly unread: Unread;
  readonly state: UnreadState;
  readonly title: string;
}

export function InboxHeader(props: InboxHeaderProps): ReactNode {
  const { state } = props;
  return (
    <>
      <PaneHeader description={DESCRIPTION} sans title={props.title}>
        {state.status === "loaded" && <MarkAllRead state={state} unread={props.unread} />}
      </PaneHeader>
      <DeletedNotice />
    </>
  );
}
