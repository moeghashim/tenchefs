import type { CookoutClient, MessageId, Refusal, TopLevelMessage } from "../../sdk/index.ts";
import { refusalOf } from "../../sdk/index.ts";
import { reopened } from "../../messages/index.ts";

type ClosingAction = "close" | "reopen";

type ClosingRefusal = Refusal & { readonly action: ClosingAction };

interface ClosingCalls {
  readonly refusal: () => ClosingRefusal | null;
  readonly close: (messageId: MessageId) => void;
  readonly reopen: (messageId: MessageId) => void;
}

type ClosingClient = Pick<CookoutClient, "closeThread" | "reopenThread">;

interface ClosingOptions {
  readonly client: ClosingClient;
  readonly changed: (parent: TopLevelMessage) => void;
  readonly refused: () => void;
}

interface Asked {
  readonly action: ClosingAction;
  readonly messageId: MessageId;
}

interface Closed {
  readonly message: TopLevelMessage;
  readonly parent: TopLevelMessage;
}

function closedAs({ message, parent }: Closed): TopLevelMessage {
  const { closedAt, closedBy } = parent;
  return { ...reopened(message), ...(closedAt && closedBy && { closedAt, closedBy }) };
}

async function after(previous: Promise<void> | null, step: () => Promise<void>): Promise<void> {
  await previous;
  await step();
}

function createThreadClosing({ changed, client, refused: notify }: ClosingOptions): ClosingCalls {
  const calls = { close: client.closeThread, reopen: client.reopenThread };
  let refused: ClosingRefusal | null = null;
  let queue: Promise<void> | null = null;

  function refuse(next: ClosingRefusal | null): void {
    if (next !== refused) {
      refused = next;
      notify();
    }
  }

  async function ask({ action, messageId }: Asked): Promise<void> {
    refuse(null);
    try {
      const { message } = await calls[action](messageId);
      changed(message);
    } catch (error: unknown) {
      refuse({ ...refusalOf(error), action });
    }
  }

  function enqueue(asked: Asked): void {
    queue = after(queue, async () => {
      await ask(asked);
    });
  }

  return {
    close: (messageId) => {
      enqueue({ action: "close", messageId });
    },
    refusal: () => refused,
    reopen: (messageId) => {
      enqueue({ action: "reopen", messageId });
    },
  };
}

export { type ClosingClient, type ClosingRefusal, closedAs, createThreadClosing };
