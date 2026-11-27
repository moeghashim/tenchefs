import { focusEnd, moveFocus, roving, sidebar } from "./sidebar-roving.ts";
import { markRead, markShownRead, openSchedules, stepTo, toggleSubscription } from "./channel-keys.ts";
import { useBoardStore, useChannels } from "./use-board.ts";
import { useContext, useEffect, useMemo } from "react";
import type { ChannelKeys } from "./channel-keys.ts";
import type { Keymap } from "../../keymap/index.ts";
import { LandingContext } from "../../landing/index.ts";
import type { ScheduleList } from "../../board/index.ts";
import type { Unread } from "../../unread/index.ts";
import { channelOrder } from "./channel-order.ts";
import { useSidebarCounts } from "./use-unread-levels.ts";

interface SidebarKeys {
  readonly keymap: Keymap;
  readonly me: string;
  readonly scheduleList: ScheduleList;
  readonly unread: Unread;
}

function useChannelKeys(props: SidebarKeys, announce: (text: string) => void): ChannelKeys {
  const { scheduleList, unread } = props;
  const store = useBoardStore();
  const channels = useChannels();
  const counts = useSidebarCounts({ me: props.me }).channels;
  const land = useContext(LandingContext).ask;
  return useMemo(
    () => ({
      announce,
      counts,
      land,
      order: channelOrder(channels),
      scheduleList,
      store,
      unread,
    }),
    [announce, channels, counts, land, scheduleList, store, unread],
  );
}

function useSidebarKeys(props: SidebarKeys): void {
  const { keymap } = props;
  const keys = useChannelKeys(props, keymap.announce);
  useEffect(() => roving(), []);
  useEffect(() => {
    const unbind = [
      keymap.bind({
        actions: {
          markShownChannelRead: markShownRead(keys),
          nextChannel: stepTo({ keys, step: "next", unreadOnly: false }),
          nextUnreadChannel: stepTo({ keys, step: "next", unreadOnly: true }),
          previousChannel: stepTo({ keys, step: "previous", unreadOnly: false }),
          previousUnreadChannel: stepTo({ keys, step: "previous", unreadOnly: true }),
        },
        scope: "everywhere",
      }),
      keymap.bind({
        actions: {
          firstLink: focusEnd("first"),
          lastLink: focusEnd("last"),
          nextLink: moveFocus("next"),
          previousLink: moveFocus("previous"),
        },
        scope: "sidebar",
        within: sidebar,
      }),
      keymap.bind({
        actions: {
          markChannelRead: markRead(keys),
          openSchedules: openSchedules(keys),
          toggleSubscription: toggleSubscription(keys),
        },
        scope: "channel row",
        within: sidebar,
      }),
    ];
    return (): void => {
      for (const each of unbind) {
        each();
      }
    };
  }, [keymap, keys]);
}

export { useSidebarKeys };
