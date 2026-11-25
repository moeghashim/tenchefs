import type { Message, ReactionCount, ReactionName, Refusal } from "../../sdk/index.ts";
import { reactionNames, reactionSymbols } from "../../messages/index.ts";
import { reactionRefusal, reactionsOf } from "../../board/index.ts";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Announce } from "./announcer.ts";
import type { ReactionChoice } from "../../design-system/messages.tsx";
import { useBoardStore } from "./use-board.ts";

const KEYS: Readonly<Record<ReactionName, string>> = { thumbs_down: "-", thumbs_up: "+" };

const IN_HOVER_BAR: Readonly<Record<ReactionName, boolean>> = { thumbs_down: false, thumbs_up: true };

interface Reacting {
  readonly message: Message;
  readonly me: string;
}

interface Announcing extends Reacting {
  readonly announce: Announce;
}

const TEXT = { added: "Reaction added", removed: "Reaction removed" } as const;

interface Toggled {
  readonly reactions: readonly ReactionCount[];
  readonly reaction: ReactionName;
  readonly me: string;
}

function announcedOf({ me, reaction, reactions }: Toggled): string {
  const mine = reactions.some((each) => each.reaction === reaction && each.by.some((name) => name === me));
  if (mine) {
    return TEXT.removed;
  }
  return TEXT.added;
}

interface Shown {
  readonly reactions: readonly ReactionCount[];
  readonly toggle: (reaction: ReactionName) => void;
}

function useShownReactions({ me, message }: Reacting): Shown {
  const store = useBoardStore();
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

function useReactionChoices({ announce, ...reacting }: Announcing): readonly ReactionChoice[] {
  const { reactions, toggle } = useShownReactions(reacting);
  const { me } = reacting;
  return useMemo(
    () =>
      reactionNames.map((reaction) => ({
        inHoverBar: IN_HOVER_BAR[reaction],
        key: KEYS[reaction],
        onReact: () => {
          announce(announcedOf({ me, reaction, reactions }));
          toggle(reaction);
        },
        symbol: reactionSymbols[reaction],
      })),
    [announce, me, reactions, toggle],
  );
}

function useReactionRefusal(): Refusal | null {
  const store = useBoardStore();
  return useSyncExternalStore(store.subscribeShowing("reactions"), () => reactionRefusal(store.snapshot()));
}

export { useReactionChoices, useReactionRefusal, useShownReactions };
