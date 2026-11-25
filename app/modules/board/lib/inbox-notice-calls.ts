import type { Change, InboxEntries, InboxState } from "./inbox-entries.ts";
import type {
  ChannelName,
  CookoutClient,
  DeactivatedQuietAgentId,
  DeactivationOfferId,
  MessageId,
  NudgeId,
  OfflineAlertId,
  Refusal,
} from "../../sdk/index.ts";
import { oldestOf, queryOf } from "./inbox-read.ts";
import type { Failure } from "./failure.ts";
import type { InboxClient } from "./inbox-read.ts";
import { failure } from "./failure.ts";
import { refusalOf } from "../../sdk/index.ts";

type MarkAllState = { readonly status: "idle" } | { readonly status: "marking" } | Failure;

interface InboxCallsState {
  readonly markAll: MarkAllState;
  readonly markChannel: (Refusal & { readonly channel: ChannelName }) | null;
  readonly menu: Refusal | null;
}

type InboxCallsClient = InboxClient &
  Pick<
    CookoutClient,
    | "ack"
    | "ackAll"
    | "approveAgentJoin"
    | "closeThread"
    | "denyAgentJoin"
    | "keepDeactivationOffer"
    | "markDeactivatedQuietAgentRead"
    | "markNudgeRead"
    | "markOfflineAlertRead"
    | "markUnread"
  >;

interface Calling {
  readonly client: InboxCallsClient;
  readonly pageSize: number;
  readonly held: () => InboxState;
  readonly apply: (change: Change) => void;
  readonly put: (next: Partial<InboxCallsState>) => void;
}

interface NoticeCalls {
  readonly markAlertRead: (id: OfflineAlertId) => void;
  readonly markNudgeRead: (id: NudgeId) => void;
  readonly closeNudged: (thread: MessageId) => void;
  readonly keep: (id: DeactivationOfferId) => void;
  readonly markQuietAgentRead: (id: DeactivatedQuietAgentId) => void;
}

interface JoinCalls {
  readonly hold: (id: DeactivatedQuietAgentId) => void;
  readonly release: (id: DeactivatedQuietAgentId) => void;
  readonly approve: (userCode: string) => void;
  readonly replace: (userCode: string) => void;
  readonly dismiss: (userCode: string) => void;
}

type Queue = (step: () => Promise<void>) => void;

const IDLE = { status: "idle" } as const;

async function stepAfter(previous: Promise<void>, step: () => Promise<void>): Promise<void> {
  await previous;
  await Promise.allSettled([step()]);
}

function queued(): Queue {
  let queue: Promise<void> = Promise.resolve();
  return (step) => {
    queue = stepAfter(queue, step);
  };
}

function nudgeCalls({ apply, client, held }: Calling): Pick<NoticeCalls, "closeNudged" | "markNudgeRead"> {
  const after = queued();
  return {
    closeNudged: (thread) => {
      after(async () => {
        await client.closeThread(thread);
        const nudged = [...held().entries.nudges.values()].filter(({ parent }) => parent.id === thread);
        apply({ nudgeIds: nudged.map(({ id }) => id), type: "nudge-read" });
      });
    },
    markNudgeRead: (id) => {
      after(async () => {
        const { nudge } = await client.markNudgeRead(id);
        apply({ nudgeIds: [nudge.id], type: "nudge-read" });
      });
    },
  };
}

function noticeCalls(calling: Calling): NoticeCalls {
  const { apply, client } = calling;
  const after = queued();
  return {
    ...nudgeCalls(calling),
    keep: (id) => {
      after(async () => {
        const { deactivationOffer } = await client.keepDeactivationOffer(id);
        apply({ deactivationOffer, type: "deactivation-offer" });
      });
    },
    markAlertRead: (id) => {
      after(async () => {
        const { alert } = await client.markOfflineAlertRead(id);
        apply({ alert, type: "offline-alert" });
      });
    },
    markQuietAgentRead: (id) => {
      after(async () => {
        const { deactivatedQuietAgent } = await client.markDeactivatedQuietAgentRead(id);
        apply({ deactivatedQuietAgent, type: "deactivated-quiet-agent" });
      });
    },
  };
}

function canLoadEarlier({ earlier }: InboxEntries): boolean {
  return earlier.status.status === "loaded" && earlier.hasMore && earlier.more.status !== "loading";
}

function earlierCalls({ apply, client, held, pageSize }: Calling): () => void {
  const after = queued();
  async function pageOn(): Promise<void> {
    const { earlier } = held().entries;
    const page = await client.inboxHistory(queryOf({ earlier, limit: pageSize }));
    const oldest = oldestOf({ held: earlier.oldest, items: page.items });
    apply({ hasMore: page.hasMore, items: page.items, oldest, type: "earlier-page" });
    const now = held().entries.earlier;
    if (now.read.size === earlier.read.size && now.hasMore) {
      await pageOn();
    }
  }
  return () => {
    after(async () => {
      if (!canLoadEarlier(held().entries)) {
        return;
      }
      apply({ more: { status: "loading" }, type: "earlier-more" });
      try {
        await pageOn();
        apply({ more: IDLE, type: "earlier-more" });
      } catch (error: unknown) {
        apply({ more: failure(error), type: "earlier-more" });
      }
    });
  };
}

function joinCalls({ apply, client }: Calling): JoinCalls {
  const after = queued();
  function answering(userCode: string, call: () => Promise<unknown>): void {
    after(async () => {
      try {
        await call();
        apply({ refusal: null, type: "agent-join-answered", userCode });
      } catch (error: unknown) {
        apply({ refusal: refusalOf(error), type: "agent-join-answered", userCode });
      }
    });
  }
  return {
    approve: (userCode) => {
      answering(userCode, async () => {
        await client.approveAgentJoin(userCode);
      });
    },
    dismiss: (userCode) => {
      answering(userCode, async () => {
        await client.denyAgentJoin(userCode);
      });
    },
    hold: (id) => {
      apply({ held: true, id, type: "quiet-agent-held" });
    },
    release: (id) => {
      apply({ held: false, id, type: "quiet-agent-held" });
    },
    replace: (userCode) => {
      answering(userCode, async () => {
        await client.approveAgentJoin(userCode, { force: true });
      });
    },
  };
}

export {
  type Calling,
  type InboxCallsClient,
  type InboxCallsState,
  type JoinCalls,
  type MarkAllState,
  type NoticeCalls,
  IDLE,
  earlierCalls,
  joinCalls,
  noticeCalls,
  queued,
};
