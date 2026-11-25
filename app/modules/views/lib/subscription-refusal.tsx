import { Alert } from "../../design-system/content.tsx";
import type { ChannelName } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import type { SubscriptionsState } from "../../board/index.ts";

interface SubscriptionRefusalProps {
  readonly channel: ChannelName;
  readonly state: SubscriptionsState;
}

function headerRefused(state: SubscriptionsState, channel: ChannelName): string | null {
  if (state.status !== "loaded" || state.change.status !== "failed") {
    return null;
  }
  const { change } = state;
  if (change.channel !== channel || change.from !== "channel-header") {
    return null;
  }
  return `Couldn't change the subscription (${change.code}): ${change.message}`;
}

export function SubscriptionRefusal(props: SubscriptionRefusalProps): ReactNode {
  const { state } = props;
  if (state.status === "failed") {
    return <Alert>{`Couldn't load your subscriptions (${state.code}): ${state.message}`}</Alert>;
  }
  const refused = headerRefused(state, props.channel);
  return refused !== null && <Alert>{refused}</Alert>;
}
