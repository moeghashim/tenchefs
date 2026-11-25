import { CookoutError, isServerErrorCode } from "./errors.ts";
import type { CookoutEvent, LiveConnectionId, PresenceResponse } from "../../events/index.ts";
import type { ServerSentEvent, ServerSentFrame } from "../../http/client.ts";
import { allChannelsQuery, eventsPath, liveConnectionPath, refusalEvent } from "../../events/index.ts";
import { getJson, openEvents, send } from "./request.ts";
import {
  isAgentJoinRequestsEvent,
  isAgentSessionEvent,
  isChannelDeletedEvent,
  isChannelEvent,
  isCleanCloseResponse,
  isCommandEvent,
  isConnectedEvent,
  isDeactivatedQuietAgentEvent,
  isDeactivationOfferEvent,
  isErrorResponse,
  isIdentityDeletedEvent,
  isIdentityEvent,
  isInboxItemEvent,
  isMessageEvent,
  isNudgeEvent,
  isNudgeReadEvent,
  isOfflineAlertEvent,
  isPresenceEvent,
  isPresenceResponse,
  isReactionEvent,
  isReadPositionEvent,
  isReadPositionMovedBackEvent,
  isReadReceiptEvent,
  isScheduledMessageEvent,
  isSubscriptionEvent,
  isThreadEvent,
  isTriggerEvent,
} from "./generated/validators.js";
import type { ClientConnection } from "./request.ts";
import type { MessageId } from "../../messages/index.ts";
import { presencePath } from "../../presence/index.ts";

type EventType = CookoutEvent["type"];

interface EventStream extends AsyncIterable<CookoutEvent> {
  readonly close: () => Promise<void>;
  readonly closeCleanly: () => Promise<void>;
}

interface Heard {
  readonly saw: (connection: LiveConnectionId | null) => void;
}

interface ConnectionSeen extends Heard {
  readonly current: () => LiveConnectionId | null;
}

function connectionSeen(): ConnectionSeen {
  let current: LiveConnectionId | null = null;
  return {
    current: () => current,
    saw: (connection) => {
      current = connection;
    },
  };
}

interface WatchOptions {
  readonly allChannels?: boolean;
  readonly lastEventId?: MessageId;
  readonly onHeartbeat?: () => void;
  readonly onConnected?: (latestMessageId: MessageId | null) => void;
}

const OK = 200;
const HEARTBEAT = "heartbeat";
const CONNECTED = "connected";
const NO_OPTIONS: WatchOptions = {};

function heard(comment: string, { onHeartbeat }: WatchOptions): void {
  if (comment === HEARTBEAT && typeof onHeartbeat === "function") {
    onHeartbeat();
  }
}

function resumeHeaders({ lastEventId }: WatchOptions): Readonly<Record<string, string>> {
  if (typeof lastEventId === "number") {
    return { "last-event-id": String(lastEventId) };
  }
  return {};
}

const validators: { readonly [Type in EventType]: (data: unknown) => data is Extract<CookoutEvent, { type: Type }> } = {
  "agent-join-requests": isAgentJoinRequestsEvent,
  "agent-session": isAgentSessionEvent,
  channel: isChannelEvent,
  "channel-deleted": isChannelDeletedEvent,
  command: isCommandEvent,
  "deactivated-quiet-agent": isDeactivatedQuietAgentEvent,
  "deactivation-offer": isDeactivationOfferEvent,
  identity: isIdentityEvent,
  "identity-deleted": isIdentityDeletedEvent,
  "inbox-item": isInboxItemEvent,
  message: isMessageEvent,
  nudge: isNudgeEvent,
  "nudge-read": isNudgeReadEvent,
  "offline-alert": isOfflineAlertEvent,
  presence: isPresenceEvent,
  reaction: isReactionEvent,
  "read-position": isReadPositionEvent,
  "read-position-moved-back": isReadPositionMovedBackEvent,
  "read-receipt": isReadReceiptEvent,
  "scheduled-message": isScheduledMessageEvent,
  subscription: isSubscriptionEvent,
  thread: isThreadEvent,
  trigger: isTriggerEvent,
};

function isEventType(event: string): event is EventType {
  return Object.hasOwn(validators, event);
}

function parsedData(data: string): unknown {
  try {
    const json: unknown = JSON.parse(data);
    return json;
  } catch {
    return data;
  }
}

function badEvent(event: string, details: unknown): CookoutError {
  return new CookoutError({
    code: "bad_response",
    details,
    message: `GET ${eventsPath} sent a ${event} event that doesn't match the protocol.`,
    status: OK,
  });
}

function checked({ data, event }: ServerSentEvent & { readonly event: EventType }): CookoutEvent {
  const json = parsedData(data);
  if (!validators[event](json)) {
    throw badEvent(event, json);
  }
  return json;
}

function eventOf(frame: ServerSentEvent): CookoutEvent | null {
  if (isEventType(frame.event)) {
    return checked({ ...frame, event: frame.event });
  }
  return null;
}

function refused(data: string): CookoutError {
  const json = parsedData(data);
  if (!isErrorResponse(json) || !isServerErrorCode(json.error.code)) {
    return badEvent(refusalEvent, json);
  }
  return new CookoutError({ ...json.error, code: json.error.code, status: OK });
}

function connected(data: string, { onConnected, saw }: WatchOptions & Heard): void {
  const json = parsedData(data);
  if (!isConnectedEvent(json)) {
    throw badEvent(CONNECTED, json);
  }
  saw(json.connectionId ?? null);
  if (typeof onConnected === "function") {
    onConnected(json.latestMessageId);
  }
}

function eventsIn(frame: ServerSentFrame, options: WatchOptions & Heard): readonly CookoutEvent[] {
  if ("comment" in frame) {
    heard(frame.comment, options);
    return [];
  }
  if (frame.event === refusalEvent) {
    throw refused(frame.data);
  }
  if (frame.event === CONNECTED) {
    connected(frame.data, options);
  }
  return [eventOf(frame)].filter((event) => event !== null);
}

async function* cookoutEvents(
  frames: AsyncIterable<ServerSentFrame>,
  options: WatchOptions & Heard,
): AsyncGenerator<CookoutEvent, void, undefined> {
  for await (const frame of frames) {
    yield* eventsIn(frame, options);
  }
}

async function saidCleanClose(server: ClientConnection, connection: LiveConnectionId | null): Promise<boolean> {
  if (connection === null) {
    return false;
  }
  const said = await send(server, {
    isExpected: isCleanCloseResponse,
    method: "DELETE",
    params: { connection: String(connection) },
    path: liveConnectionPath,
  })
    .then(() => true)
    .catch(() => false);
  return said;
}

function queryFor(allChannels: boolean): Readonly<Record<string, string>> {
  if (allChannels) {
    return allChannelsQuery;
  }
  return {};
}

function eventCalls(server: ClientConnection): EventCalls {
  return {
    presence: async () => {
      const everyone = await getJson(server, presencePath, isPresenceResponse);
      return everyone;
    },
    watch: async (options = NO_OPTIONS) => {
      const { close, events } = await openEvents({
        connection: server,
        headers: resumeHeaders(options),
        path: eventsPath,
        query: queryFor(options.allChannels ?? false),
      });
      const seen = connectionSeen();
      return {
        [Symbol.asyncIterator]: () => cookoutEvents(events, { ...options, saw: seen.saw }),
        close,
        closeCleanly: async () => {
          await saidCleanClose(server, seen.current());
          await close();
        },
      };
    },
  };
}

interface EventCalls {
  readonly watch: (options?: WatchOptions) => Promise<EventStream>;
  readonly presence: () => Promise<PresenceResponse>;
}

export { type EventCalls, type EventStream, type WatchOptions, eventCalls, eventOf };
