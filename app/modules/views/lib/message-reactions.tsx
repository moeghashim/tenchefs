import type { Message } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { ReactionChips } from "../../design-system/messages.tsx";
import { ReactionEntry } from "./reaction-entry.tsx";
import { useShownReactions } from "./use-reactions.ts";

const NONE = 0;

interface MessageReactionsProps {
  readonly me: string;
  readonly message: Message;
}

export function MessageReactions(props: MessageReactionsProps): ReactNode {
  const { reactions, toggle } = useShownReactions(props);
  const shown = reactions.filter((count) => count.count > NONE);
  if (shown.length === NONE) {
    return null;
  }
  return (
    <ReactionChips>
      {shown.map((count) => (
        <ReactionEntry count={count} key={count.reaction} me={props.me} toggle={toggle} />
      ))}
    </ReactionChips>
  );
}
