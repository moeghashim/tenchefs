import type { ChannelName } from "../../sdk/index.ts";
import { PressButton } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import type { SubscriptionsState } from "../../board/index.ts";
import { useBoardStore } from "./use-board.ts";
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
}

export function SubscriptionToggle(props: SubscriptionToggleProps): ReactNode {
  const { channel } = props;
  const { calls } = useBoardStore();
  const subscribed = props.state.channels.includes(channel);
  const handleClick = useCallback(() => {
    calls.setSubscribed(channel, !subscribed, "channel-header");
  }, [calls, channel, subscribed]);
  return (
    <PressButton disabled={props.state.change.status === "changing"} onClick={handleClick} pressed={subscribed}>
      {labelOf(subscribed)}
    </PressButton>
  );
}
