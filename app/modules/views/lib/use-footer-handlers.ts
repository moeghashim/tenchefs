import { useCallback, useContext } from "react";
import type { ChannelName } from "../../sdk/index.ts";
import type { Draft } from "../../composer/index.ts";
import { LandingContext } from "../../landing/index.ts";
import type { Outgoing } from "../../board/index.ts";
import { useBoardStore } from "./use-board.ts";

interface FooterOf {
  readonly channel: ChannelName;
  readonly draft: Draft;
  readonly form: string;
}

interface FooterHandlers {
  readonly post: (outgoing: Outgoing, posted: () => void) => void;
  readonly saved: () => void;
}

function useFooterHandlers({ channel, draft, form }: FooterOf): FooterHandlers {
  const store = useBoardStore();
  const { watch } = useContext(LandingContext);
  const post = useCallback(
    (outgoing: Outgoing, posted: () => void) => {
      store.channelPages.post(channel, { ...outgoing, posted });
    },
    [channel, store],
  );
  const saved = useCallback(() => {
    watch(`main form[aria-label="${form}"] textarea`);
    draft.clear();
  }, [draft, form, watch]);
  return { post, saved };
}

export { useFooterHandlers };
