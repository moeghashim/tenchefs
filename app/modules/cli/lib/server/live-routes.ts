import { eventRoutes } from "../../../events/server.ts";
import { presenceRoutes } from "../../../presence/server.ts";
import { triggerRoutes } from "../../../triggers/server.ts";

const liveRoutes = [...eventRoutes, ...presenceRoutes, ...triggerRoutes] as const;

export { liveRoutes };
export { presenceLayer } from "../../../presence/server.ts";
export { scheduledMessageRoutes, scheduledMessagesLayer } from "../../../scheduled-messages/server.ts";
export {
  BoardUrl,
  boardUrlLayer,
  mentionTriggersLayer,
  triggerCallerLive,
  triggerChangesLayer,
} from "../../../triggers/server.ts";
