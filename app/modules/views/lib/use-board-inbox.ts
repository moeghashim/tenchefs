import type { BoardState } from "../../board/index.ts";
import { useBoardStore } from "./use-board.ts";
import { useSyncExternalStore } from "react";

export function useBoardInbox<Out>(select: (state: BoardState) => Out): Out {
  const store = useBoardStore();
  return useSyncExternalStore(store.subscribeShowing("inbox"), () => select(store.snapshot()));
}
