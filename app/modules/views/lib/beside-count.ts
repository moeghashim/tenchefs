import type { UnreadState } from "../../unread/index.ts";

type LoadedState = Extract<UnreadState, { readonly status: "loaded" }>;

export function besideCountOf(state: LoadedState): number {
  return (
    state.alerts.length +
    state.nudges.length +
    state.deactivationOffers.length +
    state.deactivatedQuietAgents.length +
    state.agentJoinRequests.length
  );
}
