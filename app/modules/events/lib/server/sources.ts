import type { DeactivationOffers, Inbox, Nudges, OfflineAlerts } from "../../../inbox/server.ts";
import {
  agentJoinRequests,
  deactivatedQuietAgents,
  deactivationOffers,
  inboxItems,
  nudges,
  nudgesRead,
  reactionItems,
} from "./inbox-items.ts";
import { allChannels, channels, reactions, readReceipts, threads } from "./all-channels.ts";
import { connected, presence } from "./connected.ts";
import { identities, identityDeletions } from "./identities.ts";
import { offlineAlerts, subscriptions, triggers } from "./subscriptions.ts";
import type { AllChannelsNeeds } from "./all-channels.ts";
import type { BoardChangesNeeds } from "./board-changes.ts";
import type { EventSource } from "./source.ts";
import type { IdentityChanges } from "../../../identities/server.ts";
import type { LiveConnectionNeeds } from "./connected.ts";
import type { TriggerNeeds } from "./subscriptions.ts";
import { boardChanges } from "./board-changes.ts";
import { heartbeat } from "./source.ts";
import { readPositions } from "./read-positions.ts";

type SourceNeeds =
  | Inbox
  | Nudges
  | DeactivationOffers
  | OfflineAlerts
  | AllChannelsNeeds
  | IdentityChanges
  | BoardChangesNeeds
  | LiveConnectionNeeds
  | TriggerNeeds;

const listening: readonly EventSource<SourceNeeds>[] = [
  inboxItems,
  reactionItems,
  nudges,
  nudgesRead,
  deactivationOffers,
  deactivatedQuietAgents,
  agentJoinRequests,
  readPositions,
  subscriptions,
  offlineAlerts,
  triggers,
  allChannels,
  threads,
  identities,
  identityDeletions,
  channels,
  ...boardChanges,
  readReceipts,
  reactions,
  presence,
  heartbeat,
];

const sources = { connected, listening } as const;

export { type SourceNeeds, sources };
