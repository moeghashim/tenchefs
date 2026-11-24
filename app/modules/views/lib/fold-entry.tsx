import type { ChannelMessages } from "../../board/index.ts";
import { ClosedFold } from "../../design-system/index.tsx";
import type { Fold } from "./closed-folds.ts";
import type { MessageId } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { shownAfterClick } from "./closed-folds.ts";
import { useCallback } from "react";

interface FoldEntryProps {
  readonly fold: Fold;
  readonly day: string | null;
  readonly expanded: ReadonlyMap<MessageId, number>;
  readonly messages: ChannelMessages;
}

export function FoldEntry(props: FoldEntryProps): ReactNode {
  const { expanded, fold, messages } = props;
  const handleUnfold = useCallback(() => {
    messages.showClosed(fold.run, shownAfterClick({ expanded, run: fold.run }));
  }, [expanded, fold, messages]);
  return (
    <ClosedFold day={props.day} onClick={handleUnfold}>
      {fold.label}
    </ClosedFold>
  );
}
