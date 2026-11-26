import type { BoardStore, IdentityCalls } from "../../board/index.ts";
import type { Identity, IdentityName } from "../../sdk/index.ts";
import { channelPosters } from "./channel-posters.ts";
import { identityList } from "../../board/index.ts";

type IdentityStore = Pick<
  BoardStore,
  "identityCalls" | "snapshot" | "subscribe" | "subscribeShowing" | "subscribeShowingSessions"
>;

interface IdentityList {
  readonly identities: () => readonly Identity[];
  readonly show: () => () => void;
  readonly onChange: (refresh: () => void) => void;
  readonly refresh: () => void;
  readonly calls: IdentityCalls;
  readonly store: IdentityStore;
  readonly posters: (channel: string) => readonly IdentityName[];
}

function createIdentityList(boardStore: IdentityStore): IdentityList {
  const refreshes = new Set<() => void>();
  let seen: readonly Identity[] | null = null;
  let watchingCommands = false;

  function identities(): readonly Identity[] {
    return identityList(boardStore.snapshot());
  }

  function refresh(): void {
    for (const each of refreshes) {
      each();
    }
  }

  function checked(): void {
    const listed = identities();
    if (listed !== seen) {
      seen = listed;
      refresh();
    }
  }

  return {
    calls: boardStore.identityCalls,
    identities,
    onChange: (each) => {
      refreshes.add(each);
    },
    posters: (channel) => channelPosters({ channel, store: boardStore }),
    refresh,
    show: () => {
      if (!watchingCommands) {
        watchingCommands = true;
        boardStore.subscribeShowing("commands")(refresh);
      }
      return boardStore.subscribeShowing("identities")(() => {
        checked();
      });
    },
    store: boardStore,
  };
}

export { type IdentityList, type IdentityStore, createIdentityList };
