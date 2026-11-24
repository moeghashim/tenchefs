import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { ThreadNews, Unread, UnreadCounts, UnreadState } from "../../unread/index.ts";
import { countsByChannel, countsOf, newsByThread } from "../../unread/index.ts";
import { useMemo, useSyncExternalStore } from "react";
import { besideCountOf } from "./beside-count.ts";

const NONE_BESIDE = 0;

interface Looking {
  readonly me: string;
  readonly unread: Unread;
}

interface Counting {
  readonly me: string;
  readonly state: UnreadState;
}

interface SidebarCounts {
  readonly channels: ReadonlyMap<ChannelName, UnreadCounts>;
  readonly inbox: UnreadCounts;
}

const NOTHING_LOADED = { items: [] } as const;

function itemsOf(state: UnreadState): Pick<Extract<UnreadState, { status: "loaded" }>, "items"> {
  if (state.status !== "loaded") {
    return NOTHING_LOADED;
  }
  return state;
}

function useThreadNews({ me, unread }: Looking): ReadonlyMap<MessageId, ThreadNews> {
  const state = useSyncExternalStore(unread.subscribe, unread.snapshot);
  return useMemo(() => newsByThread({ items: itemsOf(state).items, me }), [state, me]);
}

function besidesOf(state: UnreadState): number {
  if (state.status !== "loaded") {
    return NONE_BESIDE;
  }
  return besideCountOf(state);
}

function useSidebarCounts({ me, state }: Counting): SidebarCounts {
  return useMemo(() => {
    const { items } = itemsOf(state);
    const counts = countsOf({ items, me });
    return {
      channels: countsByChannel({ items, me }),
      inbox: { ...counts, forYou: counts.forYou + besidesOf(state) },
    };
  }, [state, me]);
}

export { type Looking, useSidebarCounts, useThreadNews };
