import { MessageDeleteAsked } from "./message-delete-asked.tsx";
import type { ReactNode } from "react";
import { messageDeleting } from "../../board/index.ts";
import { useBoardStore } from "./use-board.ts";
import { useSyncExternalStore } from "react";

export function MessageDeleteConfirm(): ReactNode {
  const store = useBoardStore();
  const deleting = useSyncExternalStore(store.subscribe, () => messageDeleting(store.snapshot()));
  const { asked } = deleting;
  return asked !== null && <MessageDeleteAsked asked={asked} deleting={deleting} />;
}
