import { Array as Arr, Effect, Option, Predicate } from "effect";
import {
  appendTo,
  channelFixture as channel,
  identityName,
  isoTime,
  messageId,
  newMessageFixture as newMessage,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { StorageUnavailable } from "../../../storage/server.ts";

const MISSING = 999_999;
const GRILL = channel("grill").name;
const PAGE = { limit: 10 } as const;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const adasTitle = {
  title: "Deploy main",
  titleSetAt: isoTime("2026-01-02T00:00:00.000Z"),
  titleSetBy: identityName("ada"),
};
const gracesTitle = {
  title: "Deploy main, then smoke test",
  titleSetAt: isoTime("2026-01-03T00:00:00.000Z"),
  titleSetBy: identityName("grace"),
};
const closing = { closedAt: isoTime("2026-01-04T00:00:00.000Z"), closedBy: identityName("ada") };

function present<Value>(
  found: Effect.Effect<Value | undefined, StorageUnavailable>,
): Effect.Effect<Value, StorageUnavailable> {
  return Effect.map(found, (value) => Option.getOrThrow(Option.fromUndefinedOr(value)));
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a title set from a reply shows on the thread and the page, and another setter replaces it",
  ({ layer }) =>
    Effect.gen(function* titleAndRetitle() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      const parent = yield* appendTo(storage)(newMessage("grill", "parent"));
      const reply = yield* appendTo(storage)(newMessage("grill", "reply", { replyTo: parent.id }));
      const titled = yield* present(storage.setThreadTitle(reply.id, adasTitle));
      const retitled = yield* present(storage.setThreadTitle(parent.id, gracesTitle));
      const [thread, page] = yield* Effect.all(
        [present(storage.getThread(parent.id)), present(storage.listChannelMessages(GRILL, PAGE))],
        ONE_AT_A_TIME,
      );

      expect(titled).toMatchObject({ changed: true, parent: { ...adasTitle, id: parent.id, replyCount: 1 } });
      expect(retitled).toMatchObject({ changed: true, parent: { ...gracesTitle, id: parent.id, replyCount: 1 } });
      expect([thread.parent, page.messages]).toStrictEqual([retitled.parent, [retitled.parent]]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): setting the same title again changes nothing and keeps its first setter",
  ({ layer }) =>
    Effect.gen(function* sameTitle() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      const parent = yield* appendTo(storage)(newMessage("grill", "parent"));
      const titled = yield* present(storage.setThreadTitle(parent.id, adasTitle));
      const again = yield* storage.setThreadTitle(parent.id, { ...gracesTitle, title: adasTitle.title });

      expect(again).toStrictEqual({ changed: false, parent: titled.parent });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): clearing a title removes it and its setter, and clearing an untitled thread changes nothing",
  ({ layer }) =>
    Effect.gen(function* clearTitle() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      const parent = yield* appendTo(storage)(newMessage("grill", "parent"));
      yield* storage.setThreadTitle(parent.id, adasTitle);
      const cleared = yield* present(storage.clearThreadTitle(parent.id));
      const again = yield* storage.clearThreadTitle(parent.id);
      const thread = yield* present(storage.getThread(parent.id));

      expect(cleared).toStrictEqual({ changed: true, parent });
      expect([again, thread.parent]).toStrictEqual([{ changed: false, parent }, parent]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a reply in a closed titled thread reopens it and keeps its title",
  ({ layer }) =>
    Effect.gen(function* replyKeepsTitle() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      const parent = yield* appendTo(storage)(newMessage("grill", "parent"));
      yield* storage.setThreadTitle(parent.id, adasTitle);
      yield* storage.closeThread(parent.id, closing);
      const reply = yield* storage.appendMessage(newMessage("grill", "reply", { replyTo: parent.id }));
      const thread = yield* present(storage.getThread(parent.id));

      expect(thread.parent).toMatchObject({ ...adasTitle, replyCount: 1 });
      expect(thread.parent).not.toHaveProperty("closedAt");
      expect(reply).toMatchObject({ status: "appended", threadChanged: thread.parent });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a thread nobody titled has no title, and titling a missing message finds nothing",
  ({ layer }) =>
    Effect.gen(function* untitled() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      const parent = yield* appendTo(storage)(newMessage("grill", "parent"));
      const missing = yield* Effect.all(
        [storage.setThreadTitle(messageId(MISSING), adasTitle), storage.clearThreadTitle(messageId(MISSING))],
        ONE_AT_A_TIME,
      );
      const thread = yield* present(storage.getThread(parent.id));

      expect(Arr.filter(missing, Predicate.isNotUndefined)).toStrictEqual([]);
      expect(thread.parent).not.toHaveProperty("title");
      expect(thread.parent).not.toHaveProperty("titleSetBy");
      expect(thread.parent).not.toHaveProperty("titleSetAt");
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a top-level message appended with a title is titled by its author at its creation time",
  ({ layer }) =>
    Effect.gen(function* appendTitled() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      const parent = yield* appendTo(storage)({ ...newMessage("grill", "parent"), title: adasTitle.title });
      const [thread, page] = yield* Effect.all(
        [present(storage.getThread(parent.id)), present(storage.listChannelMessages(GRILL, PAGE))],
        ONE_AT_A_TIME,
      );

      expect(parent).toMatchObject({ title: adasTitle.title, titleSetAt: parent.createdAt, titleSetBy: "agent" });
      expect([thread.parent, page.messages]).toStrictEqual([parent, [parent]]);
    }),
);
