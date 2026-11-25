import type { DeactivatedQuietAgents, DeactivatedQuietAgentsState } from "../../unread/index.ts";
import type { DeactivatedQuietAgent } from "../../sdk/index.ts";
import { DeactivatedQuietAgentRow } from "./deactivated-quiet-agent-row.tsx";
import { FeedList } from "../../design-system/feed.tsx";
import type { Identities } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { TokenShown } from "./token-shown.tsx";
import { useSyncExternalStore } from "react";

const NONE = 0;
const LABEL = "Earlier deactivated agents";

interface EarlierDeactivatedQuietAgentsProps {
  readonly entries: DeactivatedQuietAgents;
  readonly identities: Pick<Identities, "actions">;
}

function readOf(state: DeactivatedQuietAgentsState): readonly DeactivatedQuietAgent[] {
  if (state.status !== "loaded") {
    return [];
  }
  return state.deactivatedQuietAgents.filter(({ id, read }) => read && !state.held.includes(id));
}

export function EarlierDeactivatedQuietAgents(props: EarlierDeactivatedQuietAgentsProps): ReactNode {
  const { identities } = props;
  const state = useSyncExternalStore(props.entries.subscribe, props.entries.snapshot);
  const read = readOf(state);
  return (
    read.length > NONE && (
      <FeedList label={LABEL}>
        {read.map((entry) => (
          <DeactivatedQuietAgentRow entry={entry} key={entry.id}>
            <TokenShown actions={identities.actions(entry.identity.name)} />
          </DeactivatedQuietAgentRow>
        ))}
      </FeedList>
    )
  );
}
