import type { AgentJoinRequests, DeactivatedQuietAgents, DeactivationOffers, Nudges } from "../../unread/index.ts";
import type { DeactivatedQuietAgent, DeactivationOffer, InboxAgentJoinRequest, Nudge } from "../../sdk/index.ts";
import { AgentJoinRequestRow } from "./agent-join-request-row.tsx";
import type { Identities } from "../../composer/index.ts";
import { OpenOffers } from "./open-offers.tsx";
import type { ReactNode } from "react";
import { UnreadDeactivatedQuietAgentRow } from "./unread-deactivated-quiet-agent-row.tsx";
import { UnreadNudgeRow } from "./unread-nudge-row.tsx";

interface NoticeActions {
  readonly nudges: Pick<Nudges, "close" | "markRead">;
  readonly deactivationOffers: Pick<DeactivationOffers, "keep">;
  readonly deactivatedQuietAgents: Pick<DeactivatedQuietAgents, "hold" | "markRead" | "release">;
  readonly identities: Pick<Identities, "actions">;
  readonly agentJoinRequests: AgentJoinRequests;
}

interface ForYouNoticesProps {
  readonly nudges: readonly Nudge[];
  readonly offers: readonly DeactivationOffer[];
  readonly deactivated: readonly DeactivatedQuietAgent[];
  readonly held: readonly DeactivatedQuietAgent[];
  readonly joinRequests: readonly InboxAgentJoinRequest[];
  readonly actions: NoticeActions;
}

function newestFirst(entries: readonly DeactivatedQuietAgent[]): readonly DeactivatedQuietAgent[] {
  return entries.toSorted((first, second) => second.id - first.id);
}

export function ForYouNotices(props: ForYouNoticesProps): ReactNode {
  const { actions } = props;
  return (
    <>
      {props.joinRequests.map((request) => (
        <AgentJoinRequestRow
          key={`join request ${request.userCode}`}
          request={request}
          requests={actions.agentJoinRequests}
        />
      ))}
      {newestFirst([...props.deactivated, ...props.held]).map((entry) => (
        <UnreadDeactivatedQuietAgentRow
          entries={actions.deactivatedQuietAgents}
          entry={entry}
          identities={actions.identities}
          key={`deactivated ${String(entry.id)}`}
        />
      ))}
      <OpenOffers
        deactivationOffers={actions.deactivationOffers}
        identities={actions.identities}
        offers={props.offers}
      />
      {props.nudges.map((nudge) => (
        <UnreadNudgeRow key={`nudge ${String(nudge.id)}`} nudge={nudge} nudges={actions.nudges} />
      ))}
    </>
  );
}

export type { NoticeActions };
