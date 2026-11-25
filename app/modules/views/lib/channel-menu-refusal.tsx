import { Alert } from "../../design-system/content.tsx";
import type { ChannelActions } from "./use-channel-menu.ts";
import type { ReactNode } from "react";
import type { SubscriptionsState } from "../../board/index.ts";
import { useSubscriptions } from "./use-board.ts";
import { useSyncExternalStore } from "react";

interface ChannelMenuRefusalProps {
  readonly actions: ChannelActions;
}

function subscriptionRefusal(state: SubscriptionsState): string | null {
  if (state.status !== "loaded" || state.change.status !== "failed" || state.change.from !== "channel-menu") {
    return null;
  }
  const { change } = state;
  return `Couldn't change the subscription to #${change.channel} (${change.code}): ${change.message}`;
}

export function ChannelMenuRefusal(props: ChannelMenuRefusalProps): ReactNode {
  const { unread } = props.actions;
  const marked = useSyncExternalStore(unread.markChannel.subscribe, unread.markChannel.refusal);
  const subscribed = useSubscriptions();
  const refusal = subscriptionRefusal(subscribed);
  return (
    <>
      {marked !== null && (
        <Alert>{`Couldn't mark #${marked.channel} as read (${marked.code}): ${marked.message}`}</Alert>
      )}
      {refusal !== null && <Alert>{refusal}</Alert>}
    </>
  );
}
