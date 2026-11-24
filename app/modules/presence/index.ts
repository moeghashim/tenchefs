/**
 * Presence on the wire, shared by the server, the SDK, the CLI and the web: whether each identity is online, and if
 * not, when it was last seen (GLOSSARY.md, Presence and Online; ADR "presence comes from live connections"). Every
 * word the wire uses for it (the path, the event's `type`, the CLI's field) is named here once, so renaming the term
 * is one change.
 */
import type { TriggerFailure, TriggerResult } from "../triggers/index.ts";
import type { IdentityName } from "../identities/index.ts";
import type { IsoTime } from "../time/index.ts";
import { triggerErrorCodes } from "../triggers/index.ts";

declare const brand: unique symbol;

const FIRST_CONNECTION = 1;
const FIRST_ALERT = 1;

/**
 * The ID of one live connection, which the stream's `connected` event carries: a positive whole number, unique
 * while the server runs. A `cookout watch` exiting on purpose names it in its clean close.
 */
export type LiveConnectionId = number & { readonly [brand]: "LiveConnectionId" };

/**
 * Whether `value` is a positive whole number; if so, it is a `LiveConnectionId`.
 * @param value The number to check.
 * @returns Whether `value` is a `LiveConnectionId`.
 */
export function isLiveConnectionId(value: number): value is LiveConnectionId {
  return Number.isSafeInteger(value) && value >= FIRST_CONNECTION;
}

/** The wire's word for the feature: the CLI's field, the event's `type` and the last part of the path. */
export const presenceName = "presence";

/** How an online identity is connected: a `cookout watch`, with the host its agent session was joined from when the joining client sent one, or a web tab. */
export type LiveConnectionDetail = { readonly via: "watch"; readonly host?: string } | { readonly via: "web" };

/**
 * Why an offline identity went offline, as its profile shows it ("offline: session revoked"): it ran `cookout leave`,
 * its token was refused (an agent session revoked or expired, an Identity token rotated, the identity deactivated), or
 * its connection dropped and nothing reconnected within the grace (ADR "how a live connection ends").
 */
export const offlineReasons = [
  "left",
  "session revoked",
  "session expired",
  "token rotated",
  "deactivated",
  "connection lost",
  "trigger failed",
] as const;

/** One of `offlineReasons`. */
export type OfflineReason = (typeof offlineReasons)[number];

/**
 * One identity's presence. An online identity carries the detail of its most recent live connection, unless it shows
 * online only because the server just restarted (the boot grace). An offline one carries when it was last seen, unless
 * it never was, and why it went offline when the server knows. A Deactivated identity is always offline. `warning` is
 * the owner's warning: set only in what the agent's owner reads, while the agent is offline after an unexpected end
 * (the end that raised an offline alert), until it next has a live connection.
 *
 * An agent with a trigger URL whose last call didn't fail can be reached now, so it is online too (Matt, 2026-11-24,
 * mattpocock/cookout#378): when that is the only reason, it carries `wakesOnMention` and no `connection`. One whose
 * last trigger call failed and that has no live connection is Unreachable: offline, carrying that call's result in
 * `unreachable`.
 */
export interface Presence {
  readonly identity: IdentityName;
  readonly online: boolean;
  readonly connection?: LiveConnectionDetail;
  readonly lastSeenAt?: IsoTime;
  readonly offlineReason?: OfflineReason;
  readonly warning?: true;
  readonly wakesOnMention?: true;
  readonly unreachable?: TriggerResult;
}

/** The answer to `GET /v1/presence`: every identity's presence, Deactivated ones included, sorted by name. */
export interface PresenceResponse {
  readonly presence: readonly Presence[];
}

/** `GET /v1/presence`: every identity's presence, answering `PresenceResponse`. */
export const presencePath = `/v1/${presenceName}`;

/**
 * The code of the `refusal` event that ends an agent's live connection when a newer one opens: an agent holds one
 * live connection at most, and `cookout watch` exits 6 on it (ADR "one live connection per agent").
 */
export const watchReplaced = "watch_replaced";

/**
 * The ID of one offline alert: a positive whole number, the order alerts were raised in. Mark all as read names the
 * newest one the caller has seen.
 */
export type OfflineAlertId = number & { readonly [brand]: "OfflineAlertId" };

/**
 * Whether `value` is a positive whole number; if so, it is an `OfflineAlertId`.
 * @param value The number to check.
 * @returns Whether `value` is an `OfflineAlertId`.
 */
export function isOfflineAlertId(value: number): value is OfflineAlertId {
  return Number.isSafeInteger(value) && value >= FIRST_ALERT;
}

/**
 * An offline alert (GLOSSARY.md): an item in an agent's owner's Inbox saying the agent went offline unexpectedly and
 * why, as "@triage went offline: connection lost". It is no message, so it moves no Read position. `backOnlineAt` is
 * when the agent next had a live connection, absent while it is still offline.
 *
 * A failed call to an agent's trigger URL raises one, `trigger failed`, once per failure streak (Matt, 2026-11-24,
 * mattpocock/cookout#378). It carries `trigger`: the message that didn't get through and the status or error the
 * call ended with. The next successful call sets its `backOnlineAt`; a live connection doesn't.
 */
export interface OfflineAlert {
  readonly id: OfflineAlertId;
  readonly agent: IdentityName;
  readonly offlineReason: OfflineReason;
  readonly raisedAt: IsoTime;
  readonly read: boolean;
  readonly backOnlineAt?: IsoTime;
  readonly trigger?: TriggerFailure;
}

/** The code of a mark read naming an offline alert the caller has none of. */
export const offlineAlertNotFound = "offline_alert_not_found";

/**
 * The codes presence ends a stream with, the code of an offline alert not found, and the codes setting a trigger URL
 * (which presence reports on) is refused with.
 */
export const presenceErrorCodes = [watchReplaced, offlineAlertNotFound, ...triggerErrorCodes] as const;
