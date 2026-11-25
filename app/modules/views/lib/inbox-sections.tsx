import type { ComponentProps, ReactNode } from "react";
import { ForYouNotices } from "./for-you-notices.tsx";
import type { InboxRows } from "./use-inbox-rows.ts";
import { InboxSection } from "./inbox-section.tsx";
import type { InboxSelection } from "../../paths/index.ts";
import type { NoticeActions } from "./for-you-notices.tsx";
import type { UnreadState } from "../../unread/index.ts";

const NONE = 0;

const TEXT = { activity: "Activity", forYou: "For you" } as const;

type Loaded = Extract<UnreadState, { readonly status: "loaded" }>;

interface InboxSectionsProps {
  readonly actions: ComponentProps<typeof InboxSection>["actions"];
  readonly unread: Loaded;
  readonly me: string;
  readonly rows: InboxRows;
  readonly selected: InboxSelection | null;
  readonly notices: NoticeActions;
  readonly besides: number;
}

export function InboxSections(props: InboxSectionsProps): ReactNode {
  const { me, rows, selected, unread } = props;
  return (
    <>
      <InboxSection
        actions={props.actions}
        besides={props.besides}
        forYou
        uncounted={unread.heldDeactivatedQuietAgents.length}
        me={me}
        rows={rows}
        selected={selected}
        title={TEXT.forYou}
      >
        <ForYouNotices
          actions={props.notices}
          deactivated={unread.deactivatedQuietAgents}
          held={unread.heldDeactivatedQuietAgents}
          joinRequests={unread.agentJoinRequests}
          nudges={unread.nudges}
          offers={unread.deactivationOffers}
        />
      </InboxSection>
      <InboxSection
        actions={props.actions}
        besides={NONE}
        forYou={false}
        me={me}
        rows={rows}
        selected={selected}
        title={TEXT.activity}
        uncounted={NONE}
      />
    </>
  );
}
