import type { ReactionCount, ReactionName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { ReactionChip } from "../../design-system/messages.tsx";
import { reactionSymbols } from "../../messages/index.ts";
import { useCallback } from "react";

interface ReactionEntryProps {
  readonly count: ReactionCount;
  readonly me: string;
  readonly toggle: (reaction: ReactionName) => void;
}

export function ReactionEntry(props: ReactionEntryProps): ReactNode {
  const { count, toggle } = props;
  const handleToggle = useCallback(() => {
    toggle(count.reaction);
  }, [count.reaction, toggle]);
  return (
    <ReactionChip
      count={count.count}
      mine={count.by.some((name) => name === props.me)}
      names={count.by}
      onToggle={handleToggle}
      symbol={reactionSymbols[count.reaction]}
    />
  );
}
