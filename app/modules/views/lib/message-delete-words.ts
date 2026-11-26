import type { DeleteOutcome, MessageDeleting } from "../../board/index.ts";
import type { Message } from "../../sdk/index.ts";

const NONE = 0;
const ONE = 1;

const TEXT = {
  body: "There's no undo.",
  confirm: "Delete",
  deleted: "Message deleted",
  failed: "Couldn't delete the message.",
  message: "Delete this message?",
} as const;

function repliesWord(count: number): string {
  if (count === ONE) {
    return "reply";
  }
  return "replies";
}

function titleOf(message: Message): string {
  if (message.kind !== "top-level" || message.replyCount === NONE) {
    return TEXT.message;
  }
  return `Delete this thread and its ${String(message.replyCount)} ${repliesWord(message.replyCount)}?`;
}

function refusalWords(deleting: MessageDeleting): string | null {
  if (deleting.refusal === null) {
    return null;
  }
  return `${TEXT.failed} ${deleting.refusal.message}`;
}

function outcomeWords(outcome: DeleteOutcome): string {
  if ("deleted" in outcome) {
    return TEXT.deleted;
  }
  return `${TEXT.failed} ${outcome.refusal.message}`;
}

export { TEXT as DELETE_TEXT, outcomeWords, refusalWords, titleOf };
