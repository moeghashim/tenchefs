import type { MessageId, Reply } from "../../sdk/index.ts";

const NONE = 0;

interface Folding {
  readonly replies: readonly Reply[];
  readonly readPosition: number | null;
  readonly linked: MessageId | null;
  readonly kept: number;
  readonly unlined: "read" | "shown";
}

interface Folded {
  readonly earlier: readonly Reply[];
  readonly shown: readonly Reply[];
}

function isRead(reply: Reply, { readPosition, unlined }: Folding): boolean {
  if (readPosition === null) {
    return unlined === "read";
  }
  return reply.id <= readPosition;
}

function isBeforeLinked(reply: Reply, { linked }: Folding): boolean {
  return linked === null || reply.id < linked;
}

function foldedOf(folding: Folding): Folded {
  const { replies } = folding;
  const keptFrom = Math.max(NONE, replies.length - folding.kept);
  const folded = new Set(
    replies.filter((reply, index) => index < keptFrom && isRead(reply, folding) && isBeforeLinked(reply, folding)),
  );
  return {
    earlier: replies.filter((reply) => folded.has(reply)),
    shown: replies.filter((reply) => !folded.has(reply)),
  };
}

export { type Folding, foldedOf };
