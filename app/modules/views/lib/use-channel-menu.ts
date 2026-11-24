import type { ActionMenuParts, MenuChoice } from "../../design-system/index.tsx";
import type { Subscriptions, SubscriptionsState } from "../../board/index.ts";
import type { Unread, UnreadCounts } from "../../unread/index.ts";
import { useMemo, useSyncExternalStore } from "react";
import type { ChannelName } from "../../sdk/index.ts";
import { hasUnread } from "./unread-counts.ts";

const TEXT = { markRead: "Mark all as read", subscribe: "Subscribe", unsubscribe: "Unsubscribe" } as const;

interface ChannelActions {
  readonly subscriptions: Subscriptions;
  readonly unread: Unread;
}

interface ChannelMenuOf extends ChannelActions {
  readonly channel: ChannelName;
  readonly counts: UnreadCounts;
}

interface SubscriptionOf {
  readonly channel: ChannelName;
  readonly state: SubscriptionsState;
  readonly subscriptions: Subscriptions;
}

function wordsOf(subscribed: boolean): Pick<MenuChoice, "icon" | "label"> {
  if (subscribed) {
    return { icon: "unsubscribe", label: TEXT.unsubscribe };
  }
  return { icon: "subscribe", label: TEXT.subscribe };
}

function subscriptionChoices({ channel, state, subscriptions }: SubscriptionOf): readonly MenuChoice[] {
  if (state.status !== "loaded") {
    return [];
  }
  const disabled = state.change.status === "changing";
  const subscribed = state.channels.includes(channel);
  function flip(): void {
    subscriptions.setSubscribed(channel, !subscribed, "channel-menu");
  }
  return [{ ...wordsOf(subscribed), disabled, href: null, onSelect: flip }];
}

function useChannelMenu({ channel, counts, subscriptions, unread }: ChannelMenuOf): ActionMenuParts {
  const state = useSyncExternalStore(subscriptions.subscribe, subscriptions.snapshot);
  const unseen = hasUnread(counts);
  return useMemo(() => {
    function markRead(): void {
      unread.markChannelRead(channel);
    }
    return {
      choices: [
        { disabled: !unseen, href: null, icon: "mark-read", label: TEXT.markRead, onSelect: markRead },
        ...subscriptionChoices({ channel, state, subscriptions }),
      ],
      label: `#${channel} actions`,
    };
  }, [channel, state, subscriptions, unread, unseen]);
}

export { type ChannelActions, useChannelMenu };
