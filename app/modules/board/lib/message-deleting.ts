import type { CookoutClient, Message, MessageId, Refusal } from "../../sdk/index.ts";
import { refusalOf } from "../../sdk/index.ts";

type DeletingClient = Pick<CookoutClient, "deleteMessage">;

type DeleteOutcome = { readonly deleted: Message } | { readonly refusal: Refusal };

type Answered = (outcome: DeleteOutcome) => void;

interface MessageDeleting {
  readonly asked: Message | null;
  readonly pending: boolean;
  readonly refusal: Refusal | null;
}

interface DeletingCalls {
  readonly askDelete: (message: Message) => void;
  readonly cancelDelete: () => void;
  readonly deleteMessage: (messageId: MessageId, answered: Answered) => void;
  readonly deleting: () => MessageDeleting;
}

interface DeletingOptions {
  readonly client: DeletingClient;
  readonly deleted: (message: Message) => void;
  readonly changed: () => void;
}

interface Asked {
  readonly messageId: MessageId;
  readonly answered: Answered;
}

async function after(previous: Promise<void> | null, step: () => Promise<void>): Promise<void> {
  await previous;
  await step();
}

const NOT_ASKED: MessageDeleting = { asked: null, pending: false, refusal: null };

function createMessageDeleting({ changed, client, deleted }: DeletingOptions): DeletingCalls {
  let state = NOT_ASKED;
  let queue: Promise<void> | null = null;

  function become(next: MessageDeleting): void {
    state = next;
    changed();
  }

  async function ask({ answered, messageId }: Asked): Promise<void> {
    try {
      const { message } = await client.deleteMessage(messageId);
      deleted(message);
      become(NOT_ASKED);
      answered({ deleted: message });
    } catch (error: unknown) {
      const refusal = refusalOf(error);
      become({ ...state, pending: false, refusal });
      answered({ refusal });
    }
  }

  return {
    askDelete: (message) => {
      become({ ...NOT_ASKED, asked: message });
    },
    cancelDelete: () => {
      become(NOT_ASKED);
    },
    deleteMessage: (messageId, answered) => {
      if (state.pending) {
        return;
      }
      become({ ...state, pending: true, refusal: null });
      queue = after(queue, async () => {
        await ask({ answered, messageId });
      });
    },
    deleting: () => state,
  };
}

export { type Answered, type DeleteOutcome, type DeletingClient, type MessageDeleting, createMessageDeleting };
