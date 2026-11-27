import type { ComponentProps, ReactNode } from "react";
import type { Reading, Unread } from "../../unread/index.ts";
import { useContext, useMemo, useSyncExternalStore } from "react";
import type { Composer } from "../../composer/index.ts";
import { InboxConversation } from "./inbox-conversation.tsx";
import type { InboxKeys } from "./use-inbox-keys.ts";
import { InboxList } from "./inbox-list.tsx";
import type { InboxSelection } from "../../paths/index.ts";
import { LandingContext } from "../../landing/index.ts";
import type { PanelEdgeParts } from "../../design-system/layout.tsx";
import { useInboxKeys } from "./use-inbox-keys.ts";
import { useInboxRows } from "./use-inbox-rows.ts";

const CONVERSATION = "Conversation";

interface InboxProps {
  readonly composer: Composer;
  readonly edge: PanelEdgeParts;
  readonly keymap: InboxKeys["keymap"];
  readonly unread: Unread;
  readonly me: string;
  readonly reading: Reading;
  readonly scheduling: ComponentProps<typeof InboxConversation>["scheduling"];
  readonly selected: InboxSelection | null;
}

export function InboxView(props: InboxProps): ReactNode {
  const { composer, keymap, me, selected, unread } = props;
  const state = useSyncExternalStore(unread.subscribe, unread.snapshot);
  const rows = useInboxRows({ me, selected, state, unread });
  const { agentJoinRequests, deactivatedQuietAgents, deactivationOffers, nudges } = unread;
  const { identities } = composer;
  const notices = useMemo(
    () => ({ agentJoinRequests, deactivatedQuietAgents, deactivationOffers, identities, nudges }),
    [agentJoinRequests, deactivatedQuietAgents, deactivationOffers, nudges, identities],
  );
  const { watch } = useContext(LandingContext);
  useInboxKeys({ conversation: CONVERSATION, keymap, selected, watch });
  return (
    <>
      <InboxList
        keymap={keymap}
        me={me}
        notices={notices}
        rows={rows}
        selected={selected}
        state={state}
        unread={unread}
      />
      {state.status !== "loading" && (
        <InboxConversation
          composer={composer}
          edge={props.edge}
          keymap={keymap}
          me={me}
          reading={props.reading}
          scheduling={props.scheduling}
          selected={selected}
          unread={unread}
        />
      )}
    </>
  );
}
