import type { CookoutClient, CookoutEvent, Message, MessageId, ReactionCount } from "../../sdk/index.ts";
import type { Slice } from "./slice.ts";

type Reactions = ReadonlyMap<MessageId, readonly ReactionCount[]>;

type ReactionsClient = Pick<CookoutClient, "getThread">;

interface Changed {
  readonly messageId: MessageId;
  readonly reactions: readonly ReactionCount[];
}

const UNCHANGED: Reactions = new Map();

const NO_REACTIONS: readonly ReactionCount[] = [];

function withReactions(held: Reactions, { messageId, reactions }: Changed): Reactions {
  const known = held.get(messageId) ?? null;
  if (known !== null && JSON.stringify(known) === JSON.stringify(reactions)) {
    return held;
  }
  return new Map(held).set(messageId, reactions);
}

function applied(held: Reactions, event: CookoutEvent): Reactions {
  if (event.type !== "reaction") {
    return held;
  }
  return withReactions(held, event);
}

async function readAgain(client: ReactionsClient, messageId: MessageId): Promise<Changed | null> {
  try {
    const { parent, replies } = await client.getThread(messageId);
    const read = [parent, ...replies].find((message) => message.id === messageId) ?? null;
    if (read === null) {
      return null;
    }
    return { messageId, reactions: read.reactions ?? NO_REACTIONS };
  } catch {
    return null;
  }
}

async function readHeld(client: ReactionsClient, held: Reactions): Promise<Reactions> {
  const read = await Promise.all(
    [...held.keys()].map(async (messageId) => {
      const changed = await readAgain(client, messageId);
      return changed;
    }),
  );
  let next = held;
  for (const changed of read) {
    if (changed !== null) {
      next = withReactions(next, changed);
    }
  }
  return next;
}

const reactionsSlice: Slice<Reactions, ReactionsClient> = {
  apply: applied,
  empty: UNCHANGED,
  read: readHeld,
};

interface Held {
  readonly held: Reactions;
  readonly message: Message;
}

function reactionsIn({ held, message }: Held): readonly ReactionCount[] {
  return held.get(message.id) ?? message.reactions ?? NO_REACTIONS;
}

export { type Reactions, type ReactionsClient, reactionsIn, reactionsSlice };
