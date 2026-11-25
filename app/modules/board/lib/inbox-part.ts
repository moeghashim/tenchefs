import type { Change, InboxState } from "./inbox-entries.ts";
import type { InboxCalls, InboxCallsClient, InboxCallsState } from "./inbox-calls.ts";
import type { MessagesPart } from "./messages-part.ts";
import type { Part } from "./slice.ts";
import { createInboxCalls } from "./inbox-calls.ts";
import { createPart } from "./slice.ts";
import { inboxSlice } from "./inbox-slice.ts";

interface InboxHeld {
  readonly inbox: InboxState;
  readonly inboxCalls: InboxCallsState;
  readonly inboxPageSize: number;
}

interface InboxParts {
  readonly inbox: Part<InboxState, Change>;
  readonly inboxFollowed: Pick<Part<InboxState, Change>, "apply" | "back">;
  readonly inboxCalls: InboxCalls;
  readonly inboxHeld: () => InboxHeld;
}

type KeepItems = MessagesPart["keepItems"];

interface InboxPartsOptions {
  readonly changed: () => void;
  readonly client: InboxCallsClient;
  readonly pageSize: number;
  readonly keepItems: KeepItems;
}

function keepingClient(client: InboxCallsClient, keepItems: KeepItems): InboxCallsClient {
  return {
    ...client,
    inbox: async () => {
      const read = await keepItems({ asked: client.inbox(), items: ({ items }) => items });
      return read;
    },
    inboxHistory: async (query) => {
      const page = await keepItems({ asked: client.inboxHistory(query), items: ({ items }) => items });
      return page;
    },
  };
}

function inboxPartsOf({ changed, keepItems, pageSize, ...options }: InboxPartsOptions): InboxParts {
  const client = keepingClient(options.client, keepItems);
  const inbox = createPart({ changed, client: { client, pageSize }, slice: inboxSlice });
  const { calls, state } = createInboxCalls({ apply: inbox.apply, changed, client, held: inbox.state, pageSize });
  return {
    inbox,
    inboxCalls: calls,
    inboxFollowed: {
      apply: (event) => {
        inbox.apply(event);
        if (event.type === "read-position-moved-back") {
          calls.readAgain();
        }
      },
      back: inbox.back,
    },
    inboxHeld: () => ({ inbox: inbox.state(), inboxCalls: state(), inboxPageSize: pageSize }),
  };
}

export { type InboxHeld, type InboxParts, inboxPartsOf };
export type { InboxCalls, InboxCallsClient } from "./inbox-calls.ts";
