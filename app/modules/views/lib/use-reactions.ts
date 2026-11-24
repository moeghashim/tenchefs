import type { Message, ReactionCount, ReactionName, Refusal } from "../../sdk/index.ts";
import { reactionNames, reactionSymbols } from "../../messages/index.ts";
import { reactionRefusal, reactionsOf } from "../../board/index.ts";
import { useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { ReactionChoice } from "../../design-system/index.tsx";
import { ReactionList } from "./reaction-list.ts";

const KEYS: Readonly<Record<ReactionName, string>> = { thumbs_down: "-", thumbs_up: "+" };

const IN_HOVER_BAR: Readonly<Record<ReactionName, boolean>> = { thumbs_down: false, thumbs_up: true };

interface Reacting {
  readonly message: Message;
  readonly me: string;
}

interface Shown {
  readonly reactions: readonly ReactionCount[];
  readonly toggle: (reaction: ReactionName) => void;
}

function useShownReactions({ me, message }: Reacting): Shown {
  const store = useContext(ReactionList);
  const reactions = useSyncExternalStore(store.subscribeShowing("reactions"), () =>
    reactionsOf({ message, state: store.snapshot() }),
  );
  const toggle = useCallback(
    (reaction: ReactionName) => {
      store.toggle({ me, message, reaction });
    },
    [me, message, store],
  );
  return { reactions, toggle };
}

function useReactionChoices(reacting: Reacting): readonly ReactionChoice[] {
  const { toggle } = useShownReactions(reacting);
  return useMemo(
    () =>
      reactionNames.map((reaction) => ({
        inHoverBar: IN_HOVER_BAR[reaction],
        key: KEYS[reaction],
        onReact: () => {
          toggle(reaction);
        },
        symbol: reactionSymbols[reaction],
      })),
    [toggle],
  );
}

function useReactionRefusal(): Refusal | null {
  const store = useContext(ReactionList);
  return useSyncExternalStore(store.subscribeShowing("reactions"), () => reactionRefusal(store.snapshot()));
}

export { useReactionChoices, useReactionRefusal, useShownReactions };
