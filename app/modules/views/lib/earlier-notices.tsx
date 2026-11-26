import { EarlierDeactivatedQuietAgents } from "./earlier-deactivated-quiet-agents.tsx";
import { EarlierNudges } from "./earlier-nudges.tsx";
import { EarlierOffers } from "./earlier-offers.tsx";
import type { Identities } from "../../composer/index.ts";
import type { ReactNode } from "react";
import type { Unread } from "../../unread/index.ts";

interface EarlierNoticesProps {
  readonly unread: Pick<Unread, "deactivatedQuietAgents" | "deactivationOffers" | "nudges">;
  readonly identities: Pick<Identities, "actions">;
}

export function EarlierNotices(props: EarlierNoticesProps): ReactNode {
  const { unread } = props;
  return (
    <>
      <EarlierDeactivatedQuietAgents entries={unread.deactivatedQuietAgents} identities={props.identities} />
      <EarlierOffers offers={unread.deactivationOffers} />
      <EarlierNudges nudges={unread.nudges} />
    </>
  );
}
