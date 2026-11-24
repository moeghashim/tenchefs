import type { Reading, Unread } from "../../unread/index.ts";
import { useMemo, useSyncExternalStore } from "react";
import type { Board } from "../../board/index.ts";
import type { Composer } from "../../composer/index.ts";
import { InboxConversation } from "./inbox-conversation.tsx";
import { InboxList } from "./inbox-list.tsx";
import type { InboxSelection } from "../../paths/index.ts";
import type { PanelEdgeParts } from "../../design-system/index.tsx";
import type { ReactNode } from "react";
import { useInboxKeys } from "./use-inbox-keys.ts";
import { useInboxRows } from "./use-inbox-rows.ts";

const CONVERSATION = "Conversation";

interface InboxProps {
  readonly board: Board;
  readonly composer: Composer;
  readonly edge: PanelEdgeParts;
  readonly unread: Unread;
  readonly me: string;
  readonly reading: Reading;
  readonly selected: InboxSelection | null;
}

export function InboxView(props: InboxProps): ReactNode {
  const { board, composer, me, selected, unread } = props;
  const state = useSyncExternalStore(unread.subscribe, unread.snapshot);
  const rows = useInboxRows({ me, selected, state, unread });
  const { deactivatedQuietAgents, deactivationOffers, nudges } = unread;
  const { identities } = composer;
  const notices = useMemo(
    () => ({ deactivatedQuietAgents, deactivationOffers, identities, nudges }),
    [deactivatedQuietAgents, deactivationOffers, nudges, identities],
  );
  useInboxKeys({ conversation: CONVERSATION, selected: selected !== null });
  return (
    <>
      <InboxList
        board={board}
        me={me}
        notices={notices}
        rows={rows}
        selected={selected}
        state={state}
        unread={unread}
      />
      {state.status !== "loading" && (
        <InboxConversation
          board={board}
          composer={composer}
          edge={props.edge}
          me={me}
          reading={props.reading}
          selected={selected}
          unread={unread}
        />
      )}
    </>
  );
}
