/**
 * Trigger URLs on the backend (mattpocock/cookout#378). `triggerRoutes` let an agent's owner, and nobody else, read,
 * set and clear the agent's trigger URL and token; the token is stored for the call alone and never answered.
 * `mentionTriggersLayer` subscribes to every stored message, whatever posted it, and for each agent it mentions that
 * has a trigger URL, is active and isn't its author, POSTs `{ text }` (the message's link and text) to the URL with
 * `Authorization: Bearer <token>` in the background, through the `TriggerCaller` seam: one attempt, given up after
 * 10 s, never retried, and never holding up or failing the post. Each result is stored as the URL's last result and
 * given to presence, so the agent shows online while its last call didn't fail and Unreachable once one did. The first
 * failure of a streak raises one `trigger failed` offline alert in the owner's Inbox, and the next success clears it,
 * as setting or clearing the URL does. On start, presence learns which active agents have a trigger URL; a
 * Deactivated agent has none for presence until it is reactivated.
 */
import { TriggerResponseSchema } from "./lib/server/wire.ts";

/** Calls the trigger URLs of the agents each stored message mentions, for as long as the server runs. */
export { mentionTriggersLayer } from "./lib/server/layer.ts";

/** The routes that read, set and clear an agent's trigger URL, for the server's route list. */
export { triggerRoutes } from "./lib/server/routes.ts";

/**
 * The seam every call to a trigger URL goes through: `triggerCallerLive` POSTs with Effect's `HttpClient` and never
 * follows a redirect, so one counts as a failed call. Tests swap in their own.
 */
export { type TriggerCall, TriggerCaller, type TriggerCallerService, triggerCallerLive } from "./lib/server/caller.ts";

/** The response Schemas of the trigger URL routes, for the SDK's generated validators. */
export const triggerResponseSchemas = { TriggerResponse: TriggerResponseSchema };
