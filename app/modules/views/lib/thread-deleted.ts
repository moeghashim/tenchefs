import type { ThreadMessagesState } from "../../board/index.ts";

function isThreadDeleted(state: ThreadMessagesState): boolean {
  return state.status === "loaded" && state.deleted.has(state.parent.id);
}

export { isThreadDeleted };
