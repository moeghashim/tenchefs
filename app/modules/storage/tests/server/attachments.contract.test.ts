import { Array as Arr, Effect, Option, Predicate } from "effect";
import type { Attachment, AttachmentId } from "../../../attachments/index.ts";
import {
  appendTo,
  channelFixture as channel,
  newMessageFixture as newMessage,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { isAttachmentId } from "../../../attachments/index.ts";

const PHOTO_SIZE = 3;
const NOTES_SIZE = 5;

function attachmentId(raw: string): AttachmentId {
  return Option.getOrThrow(Option.liftPredicate(raw, isAttachmentId));
}

const MISSING = attachmentId("missing");

const photo: Attachment = {
  contentType: "image/png",
  id: attachmentId("photo-id"),
  image: true,
  name: "photo.png",
  size: PHOTO_SIZE,
};

const notes: Attachment = {
  contentType: "application/octet-stream",
  id: attachmentId("notes-id"),
  image: false,
  name: "../notes.txt",
  size: NOTES_SIZE,
};

const kept: Attachment = { ...notes, id: attachmentId("kept-id"), name: "kept.txt" };

it.effect.each(storageLayers)(
  "storage contract ($adapter): a message keeps its attachments in order wherever it is read, and each is found by ID",
  ({ layer }) =>
    Effect.gen(function* attachmentsKept() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      const message = yield* appendTo(storage)({ ...newMessage("grill", ""), attachments: [photo, notes] });
      const plain = yield* appendTo(storage)(newMessage("grill", "no files"));
      const thread = yield* storage.getThread(message.id);
      const found = yield* Effect.forEach([photo.id, notes.id, MISSING], storage.findAttachment, { concurrency: 1 });

      expect(message).toMatchObject({ attachments: [photo, notes], text: "" });
      expect([thread, Arr.filter(found, Predicate.isNotUndefined)]).toStrictEqual([
        { parent: message, replies: [] },
        [photo, notes],
      ]);
      expect([Arr.map(found, Predicate.isUndefined), Predicate.hasProperty(plain, "attachments")]).toStrictEqual([
        [false, false, true],
        false,
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deleting a channel deletes its messages' attachment records and answers their IDs",
  ({ layer }) =>
    Effect.gen(function* attachmentsDeleted() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      yield* storage.createChannel(channel("lounge"));
      const parent = yield* appendTo(storage)({ ...newMessage("grill", "files"), attachments: [photo] });
      yield* appendTo(storage)({ ...newMessage("grill", "reply", { replyTo: parent.id }), attachments: [notes] });
      yield* appendTo(storage)({ ...newMessage("lounge", "kept"), attachments: [kept] });
      const deleted = yield* storage.deleteChannel(channel("grill").name);
      const found = yield* Effect.forEach([photo.id, notes.id, kept.id], storage.findAttachment, { concurrency: 1 });

      expect(deleted).toStrictEqual({ attachments: [photo.id, notes.id], channel: channel("grill") });
      expect(Arr.map(found, (one) => one ?? "gone")).toStrictEqual(["gone", "gone", kept]);
    }),
);
