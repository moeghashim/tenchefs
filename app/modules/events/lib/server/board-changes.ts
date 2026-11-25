import { AgentSessionEventSchema, ChannelDeletedEventSchema, CommandEventSchema } from "./wire.ts";
import type { Connected, EventSource, StreamRequest } from "./source.ts";
import { Effect, Stream } from "effect";
import { ScheduledMessageEventSchema, ScheduledMessages } from "../../../scheduled-messages/server.ts";
import { AgentSessions } from "../../../agent-sessions/server.ts";
import { Channels } from "../../../channels/server.ts";
import type { Identity } from "../../../identities/index.ts";
import { WebhookCommandChanges } from "../../../webhook-commands/server.ts";
import { asksForAllChannels } from "./all-channels.ts";
import { sseEvent } from "./source.ts";

type BoardChangesNeeds = Channels | WebhookCommandChanges | AgentSessions | ScheduledMessages;

const channelDeletedEvent = sseEvent(ChannelDeletedEventSchema);
const webhookCommandEvent = sseEvent(CommandEventSchema);
const agentSessionEvent = sseEvent(AgentSessionEventSchema);
const scheduledMessageEvent = sseEvent(ScheduledMessageEventSchema);

function channelDeletions(request: StreamRequest): Connected<Channels> {
  return Effect.gen(function* subscribeToChannelDeletions() {
    if (!asksForAllChannels(request)) {
      return Stream.empty;
    }
    const service = yield* Channels;
    const deleted = yield* service.deleted;
    return Stream.fromSubscription(deleted).pipe(
      Stream.mapEffect((channel) => channelDeletedEvent({ channel, type: "channel-deleted" })),
    );
  });
}

function commands(request: StreamRequest): Connected<WebhookCommandChanges> {
  return Effect.gen(function* subscribeToWebhookCommands() {
    if (!asksForAllChannels(request)) {
      return Stream.empty;
    }
    const changes = yield* WebhookCommandChanges;
    const changed = yield* changes.changed;
    return Stream.fromSubscription(changed).pipe(
      Stream.mapEffect((command) => webhookCommandEvent({ command, type: "command" })),
    );
  });
}

function mayList(caller: Identity, agent: Identity): boolean {
  return caller.admin || (agent.kind === "agent" && agent.owner === caller.name);
}

function agentSessions(request: StreamRequest): Connected<AgentSessions> {
  return Effect.gen(function* subscribeToAgentSessions() {
    if (!asksForAllChannels(request)) {
      return Stream.empty;
    }
    const service = yield* AgentSessions;
    const changed = yield* service.sessionChanged;
    return Stream.fromSubscription(changed).pipe(
      Stream.filter((agent) => mayList(request.caller, agent)),
      Stream.mapEffect((agent) => agentSessionEvent({ agent: agent.name, type: "agent-session" })),
    );
  });
}

function scheduledMessages(): Connected<ScheduledMessages> {
  return Effect.gen(function* subscribeToScheduledMessages() {
    const service = yield* ScheduledMessages;
    const changed = yield* service.changed;
    return Stream.fromSubscription(changed).pipe(
      Stream.mapEffect((change) => scheduledMessageEvent({ ...change, type: "scheduled-message" })),
    );
  });
}

const boardChanges: readonly EventSource<BoardChangesNeeds>[] = [
  channelDeletions,
  commands,
  agentSessions,
  scheduledMessages,
];

export { type BoardChangesNeeds, boardChanges };
