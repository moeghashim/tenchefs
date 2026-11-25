import type { Nudges, NudgesState } from "../../unread/index.ts";
import { FeedList } from "../../design-system/feed.tsx";
import type { InboxHistoryNudge } from "../../sdk/index.ts";
import { NudgeRow } from "./nudge-row.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const NONE = 0;
const LABEL = "Earlier nudges";

interface EarlierNudgesProps {
  readonly nudges: Nudges;
}

function readOf(state: NudgesState): readonly InboxHistoryNudge[] {
  if (state.status !== "loaded") {
    return [];
  }
  return state.nudges.filter(({ read }) => read);
}

export function EarlierNudges(props: EarlierNudgesProps): ReactNode {
  const state = useSyncExternalStore(props.nudges.subscribe, props.nudges.snapshot);
  const read = readOf(state);
  return (
    read.length > NONE && (
      <FeedList label={LABEL}>
        {read.map((nudge) => (
          <NudgeRow key={nudge.id} nudge={nudge} unread={false} />
        ))}
      </FeedList>
    )
  );
}
