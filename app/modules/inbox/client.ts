/**
 * The SDK's calls that mark one offline alert or Nudge read, answer Keep on a Deactivation offer and mark an entry about a deactivated
 * quiet agent read. Their wire types and paths are in
 * `index.ts`.
 */
import type {
  DeactivatedQuietAgentId,
  DeactivatedQuietAgentResponse,
  DeactivationOfferId,
  DeactivationOfferResponse,
  NudgeId,
  NudgeResponse,
  OfflineAlertId,
  OfflineAlertResponse,
} from "./index.ts";

/** The SDK's call on an offline alert. */
export interface OfflineAlertCalls {
  /**
   * `POST /v1/inbox/alerts/:id/read`: marks the caller's offline alert read, so it leaves the inbox and stays in its
   * history. An alert the caller has none of is 404 `offline_alert_not_found`.
   */
  readonly markOfflineAlertRead: (id: OfflineAlertId) => Promise<OfflineAlertResponse>;
}

/** The SDK's call on a Nudge. */
export interface NudgeCalls {
  /**
   * `POST /v1/inbox/nudges/:id/read`: marks one of the caller's Nudges read and answers it. Another identity's nudge,
   * or one that doesn't exist, is 404 `nudge_not_found`. A nudge also turns read when its thread is closed or gets a
   * new message, and with `ackAll({ nudgesUpTo })`.
   */
  readonly markNudgeRead: (nudgeId: NudgeId) => Promise<NudgeResponse>;
}

/** The SDK's calls on a Deactivation offer and an entry about a deactivated quiet agent. */
export interface DeactivationOfferCalls {
  /**
   * `POST /v1/inbox/deactivation-offers/:id/keep`: answers Keep on one of the caller's Deactivation offers, clearing it
   * for every recipient, and answers it. The next comes 30 days after it if the agent stays quiet. An offer the caller
   * didn't get, or one that doesn't exist, is 404 `deactivation_offer_not_found`. To deactivate instead, call
   * `deactivateIdentity`.
   */
  readonly keepDeactivationOffer: (offerId: DeactivationOfferId) => Promise<DeactivationOfferResponse>;
  /**
   * `POST /v1/inbox/deactivated-quiet-agents/:id/read`: marks one of the caller's entries about deactivated quiet agents read, for every
   * recipient, and answers it. One the caller didn't get, or one that doesn't exist, is 404
   * `deactivated_quiet_agent_not_found`. Reactivating the agent (`reactivateIdentity`) also reads it.
   */
  readonly markDeactivatedQuietAgentRead: (entryId: DeactivatedQuietAgentId) => Promise<DeactivatedQuietAgentResponse>;
}
