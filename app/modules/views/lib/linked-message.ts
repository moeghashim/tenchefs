import { createContext, useEffect, useState } from "react";
import type { MessageId } from "../../sdk/index.ts";
import type { ThreadMessagesState } from "../../board/index.ts";

const HIGHLIGHT_MS = 2000;

const LinkedMessage = createContext<MessageId | null>(null);

interface LinkedThread {
  readonly state: ThreadMessagesState;
  readonly linked: MessageId | null;
}

interface LinkedShown {
  readonly highlighted: MessageId | null;
  readonly missing: boolean;
}

interface Fading {
  readonly linked: MessageId | null;
  readonly found: boolean;
  readonly faded: MessageId | null;
}

function isInThread({ linked, state }: LinkedThread): boolean {
  if (state.status !== "loaded") {
    return false;
  }
  return state.parent.id === linked || state.replies.some((reply) => reply.id === linked);
}

function shownOf({ faded, found, linked }: Fading): MessageId | null {
  if (!found || faded === linked) {
    return null;
  }
  return linked;
}

function useLinkedMessage(thread: LinkedThread): LinkedShown {
  const { linked } = thread;
  const [faded, setFaded] = useState<MessageId | null>(null);
  const found = linked !== null && isInThread(thread);
  const highlighted = shownOf({ faded, found, linked });
  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setFaded((before) => highlighted ?? before);
    }, HIGHLIGHT_MS);
    return (): void => {
      globalThis.clearTimeout(timer);
    };
  }, [highlighted]);
  return { highlighted, missing: linked !== null && thread.state.status === "loaded" && !found };
}

export { LinkedMessage, useLinkedMessage };
