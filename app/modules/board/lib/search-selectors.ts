import type { Message, MessageId, SearchResult } from "../../sdk/index.ts";
import { heldTopLevel, threadOfMessage } from "./messages-table.ts";
import type { BoardState } from "./board-store.ts";
import type { MessagesHeld } from "./messages-table.ts";

interface HeldMessage {
  readonly held: MessagesHeld;
  readonly message: Message;
}

function isClosed({ held, message }: HeldMessage): boolean {
  const thread = threadOfMessage(message);
  const parent = heldTopLevel({ held, id: thread });
  if (parent === null) {
    return held.threadsClosed.get(thread) === true;
  }
  return typeof parent.closedAt === "string";
}

function isHeld(message: Message | undefined): message is Message {
  return typeof message === "object";
}

function resultsIn(held: MessagesHeld, ids: readonly MessageId[]): readonly SearchResult[] {
  return ids
    .map((id) => held.table.get(id))
    .filter((message) => isHeld(message))
    .map((message) => ({ message, threadClosed: isClosed({ held, message }) }));
}

function partsOf(results: readonly SearchResult[]): readonly unknown[] {
  return results.flatMap((result) => [result.message, result.threadClosed]);
}

function searchResultsOf(ids: readonly MessageId[]): (state: BoardState) => readonly SearchResult[] {
  let shown: readonly SearchResult[] = [];
  let shownParts: readonly unknown[] = [];
  return (state) => {
    const results = resultsIn(state.messages, ids);
    const parts = partsOf(results);
    if (parts.length !== shownParts.length || parts.some((part, index) => part !== shownParts[index])) {
      shown = results;
      shownParts = parts;
    }
    return shown;
  };
}

export { searchResultsOf };
