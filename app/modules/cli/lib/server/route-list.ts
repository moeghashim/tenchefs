import { addressLimitLayer, limitsLayer } from "../../../limits/server.ts";
import {
  agentSessionOwnerRoutes,
  agentSessionRoutes,
  agentSessionsLayer,
  joinCodeRoutes,
  joinRequestRoutes,
  openJoinCodeRoutes,
  openJoinRequestRoutes,
} from "../../../agent-sessions/server.ts";
import {
  avatarRoutes,
  deactivationRoutes,
  deletionRoutes,
  descriptionRoutes,
  displayNameRoutes,
  displayNamesLayer,
  identitiesLayer,
  identityChangesLayer,
  identityRoutes,
  openIdentityRoutes,
  transferRoutes,
} from "../../../identities/server.ts";
import { channelRoutes, channelsLayer } from "../../../channels/server.ts";
import {
  deactivationOffersLayer,
  inboxLayer,
  inboxRoutes,
  nudgesLayer,
  offlineAlertsLayer,
} from "../../../inbox/server.ts";
import {
  liveRoutes,
  mentionTriggersLayer,
  presenceLayer,
  scheduledMessageRoutes,
  scheduledMessagesLayer,
  triggerChangesLayer,
} from "./live-routes.ts";
import { messageRoutes, messagesLayer, reactionsLayer, readReceiptsLayer } from "../../../messages/server.ts";
import {
  webhookCommandChangesLayer,
  webhookCommandRoutes,
  webhookCommandsLayer,
} from "../../../webhook-commands/server.ts";
import { Layer } from "effect";
import type { Route } from "../../../http/server.ts";

type NeedsOf<Routes> = Routes extends readonly Route<infer Needs>[] ? Needs : never;

type RouteNeeds =
  | NeedsOf<typeof identityRoutes>
  | NeedsOf<typeof displayNameRoutes>
  | NeedsOf<typeof descriptionRoutes>
  | NeedsOf<typeof avatarRoutes>
  | NeedsOf<typeof agentSessionOwnerRoutes>
  | NeedsOf<typeof channelRoutes>
  | NeedsOf<typeof messageRoutes>
  | NeedsOf<typeof agentSessionRoutes>
  | NeedsOf<typeof inboxRoutes>
  | NeedsOf<typeof liveRoutes>
  | NeedsOf<typeof webhookCommandRoutes>
  | NeedsOf<typeof scheduledMessageRoutes>;

type OpenNeeds = NeedsOf<typeof openIdentityRoutes> | NeedsOf<typeof openJoinRequestRoutes>;

export const routes: readonly Route<RouteNeeds>[] = [
  ...identityRoutes,
  ...displayNameRoutes,
  ...descriptionRoutes,
  ...avatarRoutes,
  ...transferRoutes,
  ...deactivationRoutes,
  ...deletionRoutes,
  ...channelRoutes,
  ...messageRoutes,
  ...agentSessionRoutes,
  ...agentSessionOwnerRoutes,
  ...joinRequestRoutes,
  ...joinCodeRoutes,
  ...inboxRoutes,
  ...liveRoutes,
  ...webhookCommandRoutes,
  ...scheduledMessageRoutes,
];

export const openRoutes: readonly Route<OpenNeeds>[] = [
  ...openIdentityRoutes,
  ...openJoinRequestRoutes,
  ...openJoinCodeRoutes,
];

export const domainLayers = Layer.mergeAll(
  identitiesLayer,
  displayNamesLayer,
  channelsLayer,
  inboxLayer,
  nudgesLayer,
  webhookCommandsLayer,
  limitsLayer,
  addressLimitLayer,
  presenceLayer,
  scheduledMessagesLayer,
).pipe(
  Layer.provideMerge(Layer.mergeAll(messagesLayer, agentSessionsLayer, deactivationOffersLayer)),
  Layer.provideMerge(
    Layer.mergeAll(
      identityChangesLayer,
      webhookCommandChangesLayer,
      readReceiptsLayer,
      reactionsLayer,
      offlineAlertsLayer,
      triggerChangesLayer,
    ),
  ),
  (board) => Layer.provideMerge(mentionTriggersLayer, board),
);

export { BoardUrl, boardUrlLayer, triggerCallerLive } from "./live-routes.ts";
