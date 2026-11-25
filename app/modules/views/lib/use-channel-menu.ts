import type { ActionMenuParts, MenuChoice } from "../../design-system/messages.tsx";
import type { BoardCalls, ScheduleList, SubscriptionsState } from "../../board/index.ts";
import type { Unread, UnreadCounts } from "../../unread/index.ts";
import { useBoardStore, useSubscriptions } from "./use-board.ts";
import type { ChannelName } from "../../sdk/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import { hasUnread } from "./unread-counts.ts";
import { useMemo } from "react";

const TEXT = {
  markRead: "Mark all as read",
  schedules: "Scheduled messages",
  subscribe: "Subscribe",
  unsubscribe: "Unsubscribe",
} as const;

interface ChannelActions {
  readonly keymap: Keymap;
  readonly scheduleList: ScheduleList;
  readonly unread: Unread;
}

interface ChannelMenuOf extends ChannelActions {
  readonly channel: ChannelName;
  readonly counts: UnreadCounts;
}

interface SubscriptionOf {
  readonly channel: ChannelName;
  readonly keymap: Keymap;
  readonly state: SubscriptionsState;
  readonly setSubscribed: BoardCalls["setSubscribed"];
}

function wordsOf(subscribed: boolean): Pick<MenuChoice, "icon" | "label"> {
  if (subscribed) {
    return { icon: "unsubscribe", label: TEXT.unsubscribe };
  }
  return { icon: "subscribe", label: TEXT.subscribe };
}

function subscriptionChoices({ channel, keymap, setSubscribed, state }: SubscriptionOf): readonly MenuChoice[] {
  if (state.status !== "loaded") {
    return [];
  }
  const disabled = state.change.status === "changing";
  const subscribed = state.channels.includes(channel);
  function flip(): void {
    setSubscribed(channel, !subscribed, "channel-menu");
  }
  return [
    { ...wordsOf(subscribed), disabled, href: null, keys: keymap.shortcutOf("toggleSubscription"), onSelect: flip },
  ];
}

function useChannelMenu({ channel, counts, keymap, scheduleList, unread }: ChannelMenuOf): ActionMenuParts {
  const { setSubscribed } = useBoardStore().calls;
  const state = useSubscriptions();
  const unseen = hasUnread(counts);
  return useMemo(() => {
    function markRead(): void {
      unread.markChannelRead(channel);
    }
    function openSchedules(): void {
      scheduleList.open(channel, null);
    }
    return {
      choices: [
        {
          disabled: !unseen,
          href: null,
          icon: "mark-read",
          keys: keymap.shortcutOf("markChannelRead"),
          label: TEXT.markRead,
          onSelect: markRead,
        },
        ...subscriptionChoices({ channel, keymap, setSubscribed, state }),
        {
          disabled: false,
          href: null,
          icon: "schedule",
          keys: keymap.shortcutOf("openSchedules"),
          label: TEXT.schedules,
          onSelect: openSchedules,
        },
      ],
      label: `#${channel} actions`,
    };
  }, [channel, keymap, scheduleList, setSubscribed, state, unread, unseen]);
}

export { type ChannelActions, useChannelMenu };
