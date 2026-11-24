import type { AckAllRequest, CookoutClient, InboxItem, Refusal } from "../../sdk/index.ts";
import type { InboxItems } from "./inbox-items.ts";
import type { LiveAlerts } from "./alerts.ts";
import type { LiveDeactivatedQuietAgents } from "./deactivated-quiet-agents.ts";
import type { LiveDeactivationOffers } from "./deactivation-offers.ts";
import type { LiveNudges } from "./nudges.ts";
import type { MarkChannel } from "./mark-channel.ts";
import { createMarkChannel } from "./mark-channel.ts";
import { refusalOf } from "../../sdk/index.ts";

const LAST_ONE = -1;

type MarkAllState =
  | { readonly status: "idle" }
  | { readonly status: "marking" }
  | (Refusal & { readonly status: "failed" });

interface MarkAll {
  readonly state: () => MarkAllState;
  readonly markAllRead: () => void;
  readonly markChannel: MarkChannel;
}

interface MarkAllOptions {
  readonly client: Pick<CookoutClient, "ack" | "ackAll">;
  readonly items: InboxItems;
  readonly alerts: LiveAlerts;
  readonly nudges: LiveNudges;
  readonly deactivationOffers: LiveDeactivationOffers;
  readonly deactivatedQuietAgents: LiveDeactivatedQuietAgents;
  readonly onRead: (item: InboxItem) => void;
  readonly onChange: (state: MarkAllState) => void;
}

function upToOf(items: InboxItems): Pick<AckAllRequest, "upTo"> {
  const [newest = null] = items.list().slice(LAST_ONE);
  if (newest === null) {
    return {};
  }
  return { upTo: newest.message.id };
}

function alertsUpToOf(alerts: LiveAlerts): Pick<AckAllRequest, "alertsUpTo"> {
  const alertsUpTo = alerts.newestUnread();
  if (alertsUpTo === null) {
    return {};
  }
  return { alertsUpTo };
}

function nudgesUpToOf(nudges: LiveNudges): Pick<AckAllRequest, "nudgesUpTo"> {
  const nudgesUpTo = nudges.newestUnread();
  if (nudgesUpTo === null) {
    return {};
  }
  return { nudgesUpTo };
}

function offersUpToOf(offers: LiveDeactivationOffers): Pick<AckAllRequest, "deactivationOffersUpTo"> {
  const deactivationOffersUpTo = offers.newestOpen();
  if (deactivationOffersUpTo === null) {
    return {};
  }
  return { deactivationOffersUpTo };
}

function deactivatedUpToOf(entries: LiveDeactivatedQuietAgents): Pick<AckAllRequest, "deactivatedQuietAgentsUpTo"> {
  const deactivatedQuietAgentsUpTo = entries.newestUnread();
  if (deactivatedQuietAgentsUpTo === null) {
    return {};
  }
  return { deactivatedQuietAgentsUpTo };
}

function readNonMessages(
  options: Pick<MarkAllOptions, "deactivatedQuietAgents" | "deactivationOffers" | "nudges">,
  { deactivatedQuietAgentsUpTo, deactivationOffersUpTo, nudgesUpTo }: AckAllRequest,
): void {
  const { deactivatedQuietAgents, deactivationOffers, nudges } = options;
  if (typeof nudgesUpTo === "number") {
    nudges.readUpTo(nudgesUpTo);
  }
  if (typeof deactivationOffersUpTo === "number") {
    deactivationOffers.clearUpTo(deactivationOffersUpTo);
  }
  if (typeof deactivatedQuietAgentsUpTo === "number") {
    deactivatedQuietAgents.readUpTo(deactivatedQuietAgentsUpTo);
  }
}

function createMarkAll(options: MarkAllOptions): MarkAll {
  const { alerts, client, deactivationOffers, items, nudges, onChange, onRead } = options;
  let state: MarkAllState = { status: "idle" };
  let queue: Promise<void> = Promise.resolve();

  function change(next: MarkAllState): void {
    state = next;
    onChange(next);
  }

  async function markAfter(previous: Promise<void>, request: AckAllRequest): Promise<void> {
    await previous;
    change({ status: "marking" });
    try {
      const { alerts: read, readPositions } = await client.ackAll(request);
      items.readAll(readPositions, onRead);
      alerts.addAll(read);
      readNonMessages(options, request);
      change({ status: "idle" });
    } catch (error: unknown) {
      change({ ...refusalOf(error), status: "failed" });
    }
  }

  return {
    markAllRead: () => {
      queue = markAfter(queue, {
        ...upToOf(items),
        ...alertsUpToOf(alerts),
        ...nudgesUpToOf(nudges),
        ...offersUpToOf(deactivationOffers),
        ...deactivatedUpToOf(options.deactivatedQuietAgents),
      });
    },
    markChannel: createMarkChannel({
      client,
      items,
      onChange: () => {
        onChange(state);
      },
      onRead,
    }),
    state: () => state,
  };
}

export { type MarkAllState, createMarkAll };
