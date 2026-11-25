import type {
  AckAllRequest,
  ChannelName,
  CookoutEvent,
  DeactivatedQuietAgent,
  DeactivatedQuietAgentId,
  DeactivationOffer,
  IdentityName,
  InboxAgentJoinRequest,
  InboxHistoryNudge,
  MessageId,
} from "../../sdk/index.ts";
import type { Applying, Change, InboxEntries } from "./inbox-entries.ts";
import { same, withAll, withPart, withoutWhere } from "./inbox-entries.ts";

const NONE = 0;

function readNudge(nudge: InboxHistoryNudge): InboxHistoryNudge {
  return { ...nudge, read: true };
}

function clearedOffer(offer: DeactivationOffer): DeactivationOffer {
  return { ...offer, cleared: true };
}

function readQuietAgent(entry: DeactivatedQuietAgent): DeactivatedQuietAgent {
  return { ...entry, read: true };
}

function nudgesRead(entries: InboxEntries, read: (nudge: InboxHistoryNudge) => boolean): InboxEntries {
  const turned = [...entries.nudges.values()].filter((nudge) => !nudge.read && read(nudge));
  if (turned.length === NONE) {
    return entries;
  }
  const value = withAll({ entries: turned.map((nudge) => readNudge(nudge)), held: entries.nudges });
  return withPart({ entries, key: "nudges", value });
}

function threadRead(event: CookoutEvent): MessageId | null {
  if (event.type === "thread" && typeof event.parent.closedAt === "string") {
    return event.parent.id;
  }
  if (event.type === "message" && event.message.kind === "reply") {
    return event.message.replyTo;
  }
  return null;
}

function readByThread(entries: InboxEntries, change: Change): InboxEntries {
  if (change.type !== "thread" && change.type !== "message") {
    return entries;
  }
  const thread = threadRead(change);
  if (thread === null) {
    return entries;
  }
  return nudgesRead(entries, ({ parent }) => parent.id === thread);
}

function withoutNudgesIn(entries: InboxEntries, name: ChannelName): InboxEntries {
  const value = withoutWhere({ gone: ({ channel }) => channel.name === name, held: entries.nudges });
  return withPart({ entries, key: "nudges", value });
}

function nudgesApplied({ change, entries }: Applying): InboxEntries {
  if (change.type === "nudge") {
    const value = withAll({ entries: [{ ...change.nudge, read: false }], held: entries.nudges });
    return withPart({ entries, key: "nudges", value });
  }
  if (change.type === "nudge-read") {
    const read = new Set<number>(change.nudgeIds);
    return nudgesRead(entries, ({ id }) => read.has(id));
  }
  if (change.type === "channel-deleted") {
    return withoutNudgesIn(entries, change.channel.name);
  }
  return readByThread(entries, change);
}

function offersUpTo(entries: InboxEntries, upTo: number): InboxEntries {
  const offers = [...entries.deactivationOffers.values()].filter(({ cleared, id }) => !cleared && id <= upTo);
  const value = withAll({ entries: offers.map((offer) => clearedOffer(offer)), held: entries.deactivationOffers });
  return withPart({ entries, key: "deactivationOffers", value });
}

function quietAgentsUpTo(entries: InboxEntries, upTo: number): InboxEntries {
  const quiet = [...entries.deactivatedQuietAgents.values()].filter(({ id, read }) => !read && id <= upTo);
  const value = withAll({
    entries: quiet.map((entry) => readQuietAgent(entry)),
    held: entries.deactivatedQuietAgents,
  });
  return withPart({ entries, key: "deactivatedQuietAgents", value });
}

function upToApplied(entries: InboxEntries, request: AckAllRequest): InboxEntries {
  const { deactivatedQuietAgentsUpTo = NONE, deactivationOffersUpTo = NONE, nudgesUpTo = NONE } = request;
  const read = nudgesRead(entries, ({ id }) => id <= nudgesUpTo);
  return quietAgentsUpTo(offersUpTo(read, deactivationOffersUpTo), deactivatedQuietAgentsUpTo);
}

function withoutOffersOn(entries: InboxEntries, name: IdentityName): InboxEntries {
  const value = withoutWhere({ gone: ({ identity }) => identity.name === name, held: entries.deactivationOffers });
  return withPart({ entries, key: "deactivationOffers", value });
}

function withOffer(entries: InboxEntries, offer: DeactivationOffer): InboxEntries {
  const value = withAll({ entries: [offer], held: entries.deactivationOffers });
  return withPart({ entries, key: "deactivationOffers", value });
}

function offersApplied({ change, entries }: Applying): InboxEntries {
  if (change.type === "deactivation-offer") {
    return withOffer(entries, change.deactivationOffer);
  }
  if (change.type === "identity-deleted") {
    return withoutOffersOn(entries, change.identity.name);
  }
  if (change.type === "inbox-acked-all") {
    const read = upToApplied(entries, change.request);
    return withPart({ entries: read, key: "alerts", value: withAll({ entries: change.alerts, held: read.alerts }) });
  }
  if (change.type === "offline-alert") {
    return withPart({ entries, key: "alerts", value: withAll({ entries: [change.alert], held: entries.alerts }) });
  }
  return entries;
}

function withHeld(entries: InboxEntries, id: DeactivatedQuietAgentId, held: boolean): InboxEntries {
  if (entries.held.has(id) === held) {
    return entries;
  }
  const next = new Set(entries.held);
  if (held) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return { ...entries, held: next };
}

function quietAgentsApplied({ change, entries }: Applying): InboxEntries {
  if (change.type === "deactivated-quiet-agent") {
    const value = withAll({ entries: [change.deactivatedQuietAgent], held: entries.deactivatedQuietAgents });
    return withPart({ entries, key: "deactivatedQuietAgents", value });
  }
  if (change.type === "quiet-agent-held") {
    return withHeld(entries, change.id, change.held);
  }
  return entries;
}

interface Pending {
  readonly entries: InboxEntries;
  readonly pending: readonly InboxAgentJoinRequest[];
}

function withPending({ entries, pending }: Pending): InboxEntries {
  const listed = new Set(pending.map(({ userCode }) => userCode));
  const refusedJoins = withoutWhere({
    gone: (_refusal, userCode) => !listed.has(userCode),
    held: entries.refusedJoins,
  });
  if (same({ one: pending, other: entries.agentJoinRequests }) && refusedJoins === entries.refusedJoins) {
    return entries;
  }
  return { ...entries, agentJoinRequests: pending, refusedJoins };
}

function joinsApplied({ change, entries }: Applying): InboxEntries {
  if (change.type === "agent-join-requests") {
    return withPending({ entries, pending: change.agentJoinRequests });
  }
  if (change.type !== "agent-join-answered") {
    return entries;
  }
  const { refusal, userCode } = change;
  if (refusal === null) {
    return withPending({
      entries,
      pending: entries.agentJoinRequests.filter((request) => request.userCode !== userCode),
    });
  }
  return { ...entries, refusedJoins: new Map(entries.refusedJoins).set(userCode, refusal) };
}

export { joinsApplied, nudgesApplied, offersApplied, quietAgentsApplied, withPending };
