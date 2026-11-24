import type {
  CookoutClient,
  CookoutEvent,
  DeactivatedQuietAgent,
  DeactivationOffer,
  InboxItem,
  Nudge,
  OfflineAlert,
  Refusal,
} from "../../sdk/index.ts";
import type { Notices, NoticesBeside } from "./notices.ts";
import { catchingUp, createInboxItems, readInto } from "./inbox-items.ts";
import type { InboxItems } from "./inbox-items.ts";
import type { Live } from "../../live/index.ts";
import type { LiveAlerts } from "./alerts.ts";
import type { MarkAllState } from "./mark-all.ts";
import type { MarkUnread } from "./mark-unread.ts";
import type { Notifier } from "./notifier.ts";
import { createAlerts } from "./alerts.ts";
import { createEarlier } from "./earlier.ts";
import { createNotifier } from "./notifier.ts";
import { noticesOf } from "./notices.ts";
import { refusalOf } from "../../sdk/index.ts";

type UnreadState =
  | { readonly status: "loading" }
  | {
      readonly status: "loaded";
      readonly items: readonly InboxItem[];
      readonly alerts: readonly OfflineAlert[];
      readonly nudges: readonly Nudge[];
      readonly deactivationOffers: readonly DeactivationOffer[];
      readonly deactivatedQuietAgents: readonly DeactivatedQuietAgent[];
      readonly heldDeactivatedQuietAgents: readonly DeactivatedQuietAgent[];
      readonly markAll: MarkAllState;
    }
  | (Refusal & { readonly status: "failed" });

interface PartsOptions {
  readonly client: Pick<
    CookoutClient,
    | "closeThread"
    | "inbox"
    | "inboxHistory"
    | "keepDeactivationOffer"
    | "markDeactivatedQuietAgentRead"
    | "markNudgeRead"
    | "markOfflineAlertRead"
    | "readPositions"
  >;
  readonly pageSize?: number;
}

interface Held extends Notices {
  readonly items: InboxItems;
  readonly alerts: LiveAlerts;
}

interface Parts extends Held {
  readonly shown: Notifier<UnreadState>;
  readonly earlier: ReturnType<typeof createEarlier>;
}

interface Loading extends Held {
  readonly client: PartsOptions["client"];
  readonly markAll: () => MarkAllState;
  readonly earlier: { readonly add: (item: InboxItem) => void };
}

interface Shown extends Held {
  readonly markAll: MarkAllState;
}

interface Following extends Held {
  readonly client: PartsOptions["client"];
  readonly earlier: ReturnType<typeof createEarlier>;
  readonly live: Live | null;
  readonly markUnread: MarkUnread;
  readonly republish: () => void;
}

type Beside = { readonly alerts: readonly OfflineAlert[] } | NoticesBeside;

function loadedOf({ alerts, deactivatedQuietAgents, deactivationOffers, items, markAll, nudges }: Shown): UnreadState {
  return {
    alerts: alerts.unread(),
    deactivatedQuietAgents: deactivatedQuietAgents.unread(),
    deactivationOffers: deactivationOffers.open(),
    heldDeactivatedQuietAgents: deactivatedQuietAgents.forYou().held,
    items: items.list(),
    markAll,
    nudges: nudges.unread(),
    status: "loaded",
  };
}

async function loadedOrFailed(loading: Loading): Promise<UnreadState> {
  const { alerts, client, deactivatedQuietAgents, deactivationOffers, earlier, items, markAll, nudges } = loading;
  try {
    await readInto({
      client,
      items,
      onAlerts: alerts.addAll,
      onDeactivatedQuietAgents: deactivatedQuietAgents.unreadAre,
      onDeactivationOffers: deactivationOffers.openAre,
      onNudges: nudges.addUnread,
      onRead: earlier.add,
    });
    return loadedOf({ alerts, deactivatedQuietAgents, deactivationOffers, items, markAll: markAll(), nudges });
  } catch (error: unknown) {
    return { ...refusalOf(error), status: "failed" };
  }
}

function withBeside(shown: Notifier<UnreadState>, beside: Beside): void {
  const current = shown.current();
  if (current.status === "loaded") {
    shown.publish({ ...current, ...beside });
  }
}

function partsOf(options: PartsOptions): Parts {
  const shown = createNotifier<UnreadState>({ status: "loading" });
  const items = createInboxItems();
  return {
    alerts: createAlerts({
      client: options.client,
      onChange: (unread) => {
        withBeside(shown, { alerts: unread });
      },
    }),
    ...noticesOf({
      client: options.client,
      onChange: (beside) => {
        withBeside(shown, beside);
      },
    }),
    earlier: createEarlier({ ...options, unread: items }),
    items,
    shown,
  };
}

type Forgetting = Pick<Following, "earlier" | "items" | "nudges" | "republish">;

function forgettingDeleted({ earlier, items, nudges, republish }: Forgetting): (event: CookoutEvent) => void {
  return (event) => {
    if (event.type !== "channel-deleted") {
      return;
    }
    const { name } = event.channel;
    items.forgetChannel(name);
    nudges.forgetChannel(name);
    earlier.drop((message) => message.channel === name);
    republish();
  };
}

function follow(following: Following): void {
  const { alerts, client, deactivatedQuietAgents, deactivationOffers, earlier, items, live, markUnread, nudges } =
    following;
  const { republish } = following;
  if (live === null) {
    return;
  }
  live.subscribe((event) => {
    const besides = [nudges.receive(event), deactivationOffers.receive(event), deactivatedQuietAgents.receive(event)];
    if (
      markUnread.receive(event) ||
      items.receive(event, earlier.add) ||
      alerts.receive(event) ||
      besides.includes(true)
    ) {
      republish();
    }
  });
  live.subscribe(forgettingDeleted({ earlier, items, nudges, republish }));
  live.onBack(
    catchingUp({
      client,
      items,
      moveBack: markUnread.moveBack,
      onAlerts: alerts.addAll,
      onChange: republish,
      onDeactivatedQuietAgents: deactivatedQuietAgents.unreadAre,
      onDeactivationOffers: deactivationOffers.openAre,
      onNudges: nudges.addUnread,
      onRead: earlier.add,
    }),
  );
}

export type { DeactivatedQuietAgents, DeactivationOffers } from "./notices.ts";
export { type UnreadState, follow, loadedOf, loadedOrFailed, partsOf };
