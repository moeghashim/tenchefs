import type { ChannelName, MessageId } from "../../sdk/index.ts";
import type { ThreadNews, Unread, UnreadCounts } from "../../unread/index.ts";
import { inboxCounts, inboxCountsByChannel, inboxForYou, inboxNewsByThread } from "../../board/index.ts";
import { useBoardInbox } from "./use-board-inbox.ts";
import { useMemo } from "react";

interface Looking {
  readonly me: string;
  readonly unread: Unread;
}

interface SidebarCounts {
  readonly channels: ReadonlyMap<ChannelName, UnreadCounts>;
  readonly inbox: UnreadCounts;
}

function useThreadNews({ me }: Looking): ReadonlyMap<MessageId, ThreadNews> {
  return useBoardInbox((state) => inboxNewsByThread({ me, state }));
}

function useSidebarCounts({ me }: Pick<Looking, "me">): SidebarCounts {
  const counts = useBoardInbox((board) => inboxCounts({ me, state: board }));
  const forYou = useBoardInbox((board) => inboxForYou({ me, state: board }));
  const channels = useBoardInbox((board) => inboxCountsByChannel({ me, state: board }));
  return useMemo(() => ({ channels, inbox: { ...counts, forYou } }), [channels, counts, forYou]);
}

export { type Looking, useSidebarCounts, useThreadNews };
