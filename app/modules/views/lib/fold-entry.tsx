import type { ChannelName, MessageId } from "../../sdk/index.ts";
import { ClosedFold } from "../../design-system/messages.tsx";
import type { Fold } from "./closed-folds.ts";
import type { ReactNode } from "react";
import { shownAfterClick } from "./closed-folds.ts";
import { useBoardStore } from "./use-board.ts";
import { useCallback } from "react";

interface FoldEntryProps {
  readonly fold: Fold;
  readonly day: string | null;
  readonly expanded: ReadonlyMap<MessageId, number>;
  readonly channel: ChannelName;
  readonly open: MessageId | null;
}

export function FoldEntry(props: FoldEntryProps): ReactNode {
  const { channel, expanded, fold } = props;
  const store = useBoardStore();
  const handleUnfold = useCallback(() => {
    store.channelPages.showClosed(channel, { count: shownAfterClick({ expanded, run: fold.run }), run: fold.run });
  }, [channel, expanded, fold, store]);
  return (
    <ClosedFold current={props.open !== null && fold.run.includes(props.open)} day={props.day} onClick={handleUnfold}>
      {fold.label}
    </ClosedFold>
  );
}
