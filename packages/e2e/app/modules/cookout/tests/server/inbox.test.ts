import { CookoutUnderTest, cookoutUnderTest, freshStateFolder, succeeded } from "../../server.ts";
import type { CookoutUnderTestService, RunCookout, Session, SessionNeeds } from "../../server.ts";
import type { InboxReason, MessageId } from "@ai-hero/cookout/sdk";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { NodeServices } from "@effect/platform-node";

interface ExpectedInboxItem {
  readonly message: { readonly id: MessageId };
  readonly reasons: readonly InboxReason[];
}

const ONE_AT_A_TIME = { concurrency: 1 } as const;

function freshProcessOf(cookout: CookoutUnderTestService, token: string): RunCookout {
  return (...args) =>
    Effect.flatMap(freshStateFolder, (stateFolder) => cookout.runCookout({ args, stateFolder, token }));
}

function inboxOf(session: Session): Effect.Effect<unknown, never, SessionNeeds> {
  return Effect.map(session.cookout("inbox"), ({ stdoutJson }) => stdoutJson);
}

function inboxItem(message: MessageId, reasons: readonly InboxReason[]): ExpectedInboxItem {
  return { message: { id: message }, reasons };
}

const twoAgents = Effect.gen(function* twoAgentsInAChannel() {
  const cookout = yield* CookoutUnderTest;
  const { channel } = yield* cookout.createChannel("room");
  const first = yield* cookout.joinAgent("agent-1");
  const second = yield* cookout.joinAgent("agent-2");
  return { channel: channel.name, cookout, first, second };
});

it.live("two agents, each in its own cookout processes, post, reply and mention each other", () =>
  Effect.gen(function* talk() {
    const { channel, first, second } = yield* twoAgents;
    const top = yield* first.post(channel, `Can you look at this, @${second.name}?`);
    const reply = yield* second.post(channel, `On it, @${first.name}.`, "--reply-to", String(top));
    const thanks = yield* first.post(channel, "Thanks.", "--reply-to", String(reply));
    const thread = yield* second.cookout("thread", "get", String(top));

    expect(thread).toMatchObject(succeeded);
    expect(thread.stdoutJson).toMatchObject({
      parent: { author: { name: first.name }, id: top, kind: "top-level", mentions: [second.name], replyCount: 2 },
      replies: [
        { author: { name: second.name }, id: reply, mentions: [first.name], replyTo: top },
        { author: { name: first.name }, id: thanks, mentions: [], replyTo: top },
      ],
    });
  }).pipe(Effect.provide([cookoutUnderTest, NodeServices.layer])),
);

it.live(
  "an agent's inbox lists what mentions it and the replies in threads it follows, with every reason, but not what it read by replying",
  () =>
    Effect.gen(function* readInboxes() {
      const { channel, first, second } = yield* twoAgents;
      const top = yield* first.post(channel, `Can you look at this, @${second.name}?`);
      const reply = yield* second.post(channel, `On it, @${first.name}.`, "--reply-to", String(top));
      const firstBefore = yield* inboxOf(first);
      const thanks = yield* first.post(channel, "Thanks.", "--reply-to", String(reply));
      const firstAfter = yield* inboxOf(first);
      const secondInbox = yield* inboxOf(second);

      expect(firstBefore).toMatchObject({
        items: [
          { ...inboxItem(reply, ["followed-thread", "mention"]), channel: { name: channel }, parent: { id: top } },
        ],
      });
      expect(firstAfter).toStrictEqual({
        agentJoinRequests: [],
        alerts: [],
        deactivatedQuietAgents: [],
        deactivationOffers: [],
        items: [],
        nudges: [],
      });
      expect(secondInbox).toMatchObject({
        items: [inboxItem(top, ["mention"]), inboxItem(thanks, ["followed-thread"])],
      });
    }).pipe(Effect.provide([cookoutUnderTest, NodeServices.layer])),
);

it.live("an agent's ack clears its inbox items, and the next inbox run no longer shows them", () =>
  Effect.gen(function* ackInbox() {
    const { channel, first, second } = yield* twoAgents;
    const top = yield* first.post(channel, `Can you look at this, @${second.name}?`);
    const reply = yield* first.post(channel, `And this, @${second.name}.`, "--reply-to", String(top));
    const before = yield* inboxOf(second);
    const acks = yield* Effect.all(
      [second.cookout("ack", String(top)), second.cookout("ack", String(reply))],
      ONE_AT_A_TIME,
    );
    const after = yield* inboxOf(second);

    expect(before).toMatchObject({
      items: [inboxItem(top, ["mention"]), inboxItem(reply, ["followed-thread", "mention"])],
    });
    expect(acks).toMatchObject([
      { ...succeeded, stdoutJson: { readPosition: { channel, messageId: top, thread: null } } },
      { ...succeeded, stdoutJson: { readPosition: { channel, messageId: reply, thread: top } } },
    ]);
    expect(after).toStrictEqual({
      agentJoinRequests: [],
      alerts: [],
      deactivatedQuietAgents: [],
      deactivationOffers: [],
      items: [],
      nudges: [],
    });
  }).pipe(Effect.provide([cookoutUnderTest, NodeServices.layer])),
);

it.live("unacked inbox items are still there for a fresh cookout process with no state of its own", () =>
  Effect.gen(function* survive() {
    const { channel, cookout, first, second } = yield* twoAgents;
    const acked = yield* first.post(channel, `First, @${second.name}.`);
    const unacked = yield* first.post(channel, `Second, @${second.name}.`, "--reply-to", String(acked));
    const ack = yield* second.cookout("ack", String(acked));
    const leave = yield* second.cookout("leave");
    const fresh = yield* freshProcessOf(cookout, second.token)("inbox");

    expect([ack, leave, fresh]).toMatchObject([succeeded, succeeded, succeeded]);
    expect(fresh.stdoutJson).toMatchObject({ items: [inboxItem(unacked, ["followed-thread", "mention"])] });
  }).pipe(Effect.provide([cookoutUnderTest, NodeServices.layer])),
);
