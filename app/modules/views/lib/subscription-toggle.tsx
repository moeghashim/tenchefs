import type { Subscriptions, SubscriptionsState } from "../../board/index.ts";
import type { ChannelName } from "../../sdk/index.ts";
import { PressButton } from "../../design-system/index.tsx";
import type { ReactNode } from "react";
import { useCallback } from "react";

const TEXT = { off: "Subscribe", on: "Subscribed" } as const;

function labelOf(subscribed: boolean): string {
  if (subscribed) {
    return TEXT.on;
  }
  return TEXT.off;
}

type LoadedState = Extract<SubscriptionsState, { readonly status: "loaded" }>;

interface SubscriptionToggleProps {
  readonly channel: ChannelName;
  readonly state: LoadedState;
  readonly subscriptions: Subscriptions;
}

export function SubscriptionToggle(props: SubscriptionToggleProps): ReactNode {
  const { channel, subscriptions } = props;
  const subscribed = props.state.channels.includes(channel);
  const handleClick = useCallback(() => {
    subscriptions.setSubscribed(channel, !subscribed, "channel-header");
  }, [channel, subscribed, subscriptions]);
  return (
    <PressButton disabled={props.state.change.status === "changing"} onClick={handleClick} pressed={subscribed}>
      {labelOf(subscribed)}
    </PressButton>
  );
}
