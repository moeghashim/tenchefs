import {
  AgentJoinRequestsEventSchema,
  DeactivatedQuietAgentEventSchema,
  DeactivationOfferEventSchema,
  InboxItemEventSchema,
  NudgeEventSchema,
  NudgeReadEventSchema,
} from "./wire.ts";
import { Array as Arr, Effect, Option, Stream } from "effect";
import type { Connected, StreamRequest } from "./source.ts";
import { DeactivationOffers, Inbox, Nudges } from "../../../inbox/server.ts";
import { Messages, Reactions } from "../../../messages/server.ts";
import { AgentSessions } from "../../../agent-sessions/server.ts";
import type { MessageId } from "../../../messages/index.ts";
import { sseEvent } from "./source.ts";

const inboxItemEvent = sseEvent(InboxItemEventSchema);

const nudgeEvent = sseEvent(NudgeEventSchema);

const nudgeReadEvent = sseEvent(NudgeReadEventSchema);

const deactivationOfferEvent = sseEvent(DeactivationOfferEventSchema);
const deactivatedQuietAgentEvent = sseEvent(DeactivatedQuietAgentEventSchema);
const agentJoinRequestsEvent = sseEvent(AgentJoinRequestsEventSchema);

function reactionItems({ caller, lastEventId }: StreamRequest): Connected<Inbox | Reactions> {
  return Effect.gen(function* subscribeToReactionItems() {
    const inbox = yield* Inbox;
    const reactions = yield* Reactions;
    const changed = yield* reactions.changed;
    const live = Stream.fromSubscription(changed).pipe(
      Stream.filter(({ author, notified }) => notified && author === caller.name),
      Stream.mapEffect(({ reactions: { messageId } }) => inbox.reactionItemFor(caller, messageId)),
      Stream.flattenIterable,
    );
    const missed = Stream.flattenIterable(Stream.fromEffect(inbox.reactionItems(caller)));
    const items = Option.match(lastEventId, { onNone: () => live, onSome: () => Stream.concat(missed, live) });
    return Stream.mapEffect(items, (item) => inboxItemEvent({ item, type: "inbox-item" }));
  });
}

function inboxItems({ caller, lastEventId }: StreamRequest): Connected<Inbox | Messages> {
  return Effect.gen(function* subscribeToInboxItems() {
    const messages = yield* Messages;
    const inbox = yield* Inbox;
    const posted = yield* messages.posted;
    const live = Stream.fromSubscription(posted).pipe(
      Stream.mapEffect(({ id }) => inbox.itemFor(caller, id)),
      Stream.flattenIterable,
    );
    function missedThenLive(after: MessageId): typeof live {
      return Stream.unwrap(
        Effect.map(inbox.itemsAfter(caller, after), (missed) => {
          const seen = Option.match(Arr.last(missed), { onNone: () => after, onSome: (item) => item.message.id });
          return Stream.concat(
            Stream.fromIterable(missed),
            Stream.filter(live, (item) => item.message.id > seen),
          );
        }),
      );
    }
    const items = Option.match(lastEventId, { onNone: () => live, onSome: missedThenLive });
    return Stream.mapEffect(items, (item) =>
      Effect.map(inboxItemEvent({ item, type: "inbox-item" }), (event) => ({ ...event, id: item.message.id })),
    );
  });
}

function nudges({ caller }: StreamRequest): Connected<Nudges> {
  return Effect.gen(function* subscribeToNudges() {
    const scheduler = yield* Nudges;
    const raised = yield* scheduler.raised;
    return Stream.fromSubscription(raised).pipe(
      Stream.filter(({ recipient }) => recipient === caller.name),
      Stream.mapEffect(({ nudge }) => nudgeEvent({ nudge, type: "nudge" })),
    );
  });
}

function nudgesRead({ caller }: StreamRequest): Connected<Inbox> {
  return Effect.gen(function* subscribeToNudgesRead() {
    const inbox = yield* Inbox;
    const read = yield* inbox.nudgesRead;
    return Stream.fromSubscription(read).pipe(
      Stream.filter(({ recipient }) => recipient === caller.name),
      Stream.mapEffect(({ nudgeIds }) => nudgeReadEvent({ nudgeIds, type: "nudge-read" })),
    );
  });
}

function deactivationOffers({ caller }: StreamRequest): Connected<DeactivationOffers> {
  return Effect.gen(function* subscribeToDeactivationOffers() {
    const offers = yield* DeactivationOffers;
    const changed = yield* offers.changed;
    return Stream.fromSubscription(changed).pipe(
      Stream.filter(({ recipient }) => recipient === caller.name),
      Stream.mapEffect(({ deactivationOffer }) =>
        deactivationOfferEvent({ deactivationOffer, type: "deactivation-offer" }),
      ),
    );
  });
}

function deactivatedQuietAgents({ caller }: StreamRequest): Connected<DeactivationOffers> {
  return Effect.gen(function* subscribeToDeactivatedQuietAgents() {
    const offers = yield* DeactivationOffers;
    const changed = yield* offers.deactivatedQuietAgentChanged;
    return Stream.fromSubscription(changed).pipe(
      Stream.filter(({ recipient }) => recipient === caller.name),
      Stream.mapEffect(({ deactivatedQuietAgent }) =>
        deactivatedQuietAgentEvent({ deactivatedQuietAgent, type: "deactivated-quiet-agent" }),
      ),
    );
  });
}

function agentJoinRequests({ caller }: StreamRequest): Connected<Inbox | AgentSessions> {
  return Effect.gen(function* subscribeToAgentJoinRequests() {
    const inbox = yield* Inbox;
    const agentSessions = yield* AgentSessions;
    const changed = yield* agentSessions.joinRequestChanged;
    return Stream.fromSubscription(changed).pipe(
      Stream.mapEffect((agent) => inbox.agentJoinRequestsAfterChange({ agent, caller })),
      Stream.flatMap((listed) => Stream.fromIterable(Option.toArray(listed))),
      Stream.mapEffect((listed) => agentJoinRequestsEvent({ agentJoinRequests: listed, type: "agent-join-requests" })),
    );
  });
}

export { agentJoinRequests, deactivatedQuietAgents, deactivationOffers, inboxItems, nudges, nudgesRead, reactionItems };
