import { useCallback, useContext, useState } from "react";
import { Announcer } from "./announcer.ts";
import { LinkedMessage } from "./linked-message.ts";
import type { Message } from "../../sdk/index.ts";

const TEXT = { expanded: "Expanded" } as const;

interface Folding {
  readonly me: string;
  readonly message: Message;
  readonly opened: boolean;
}

interface Fold {
  readonly foldable: boolean;
  readonly unfold: () => void;
}

function isForMe({ me, message }: Folding): boolean {
  return message.author.name === me || message.mentions.some((name) => name === me);
}

function shownAtOnce(folding: Folding, linked: boolean): boolean {
  return folding.opened || linked || isForMe(folding);
}

function useFold(folding: Folding): Fold {
  const announce = useContext(Announcer);
  const linked = useContext(LinkedMessage) === folding.message.id;
  const [unfolded, setUnfolded] = useState(false);
  const shown = shownAtOnce(folding, linked);
  if (shown && !unfolded) {
    setUnfolded(true);
  }
  const unfold = useCallback(() => {
    setUnfolded(true);
    announce(TEXT.expanded);
  }, [announce]);
  return { foldable: !unfolded && !shown, unfold };
}

export { type Fold, useFold };
