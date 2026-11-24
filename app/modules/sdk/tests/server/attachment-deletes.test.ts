import { Array as Arr, Effect } from "effect";
import type { Attachment, NewAttachment } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const NOT_FOUND = 404;
const FILL = 7;
const SIZE = 12;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const gone = { code: "attachment_not_found", status: NOT_FOUND };

function file(name: string): NewAttachment {
  return { bytes: new Uint8Array(SIZE).fill(FILL), name };
}

interface Posted {
  readonly ann: TestIdentity;
  readonly ids: readonly Attachment["id"][];
}

function postedInGrill(cookout: TestCookoutService): Effect.Effect<Posted> {
  return Effect.gen(function* postInGrill() {
    const ann = yield* cookout.createIdentity("ann");
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const { message } = yield* answer(() =>
      ann.client.createMessage({ attachments: [file("a.bin"), file("b.bin")], channel: "grill", text: "files" }),
    );
    const reply = yield* answer(() =>
      ann.client.createMessage({ attachments: [file("c.bin")], channel: "grill", replyTo: message.id, text: "more" }),
    );
    const attachments = [...(message.attachments ?? []), ...(reply.message.attachments ?? [])];
    return { ann, ids: Arr.map(attachments, ({ id }) => id) };
  });
}

function postedInLounge(ann: TestIdentity): Effect.Effect<readonly Attachment["id"][]> {
  return Effect.gen(function* postInLounge() {
    yield* answer(() => ann.client.createChannel({ name: "lounge" }));
    const { message } = yield* answer(() =>
      ann.client.createMessage({ attachments: [file("kept.bin")], channel: "lounge", text: "kept" }),
    );
    return Arr.map(message.attachments ?? [], ({ id }) => id);
  });
}

it.effect("deleting a channel deletes its attachments: each asset URL gives 404 and the disk holds no bytes", () =>
  Effect.gen(function* channelDeleteTakesBytes() {
    const cookout = yield* TestCookout;
    const { ann, ids } = yield* postedInGrill(cookout);
    const keptIds = yield* postedInLounge(ann);
    const before = yield* cookout.heldAssets([...ids, ...keptIds]);
    yield* answer(() => cookout.client.deleteChannel("grill"));
    const served = yield* Effect.forEach(ids, (id) => refusal(() => ann.client.getAttachment(id)), ONE_AT_A_TIME);
    const after = yield* cookout.heldAssets([...ids, ...keptIds]);

    expect(before).toStrictEqual([...ids, ...keptIds]);
    expect(served).toMatchObject([gone, gone, gone]);
    expect(after).toStrictEqual(keptIds);
  }).pipe(Effect.provide(testCookout({ storage: "sqlite" }))),
);

it.effect("when the asset store can't remove the bytes, the failure is logged and the channel delete stands", () =>
  Effect.gen(function* removalFails() {
    const cookout = yield* TestCookout;
    const { ann, ids } = yield* postedInGrill(cookout);
    const deleted = yield* answer(() => cookout.client.deleteChannel("grill"));
    const after = yield* Effect.all(
      {
        channel: refusal(() => ann.client.getChannel("grill")),
        served: Effect.forEach(ids, (id) => refusal(() => ann.client.getAttachment(id)), ONE_AT_A_TIME),
      },
      ONE_AT_A_TIME,
    );
    const logs = yield* cookout.logs;

    expect(deleted).toMatchObject({ channel: { name: "grill" } });
    expect(after).toMatchObject({
      channel: { code: "channel_not_found", status: NOT_FOUND },
      served: [gone, gone, gone],
    });
    expect(logs).toContainEqual({
      level: "ERROR",
      message: `The bytes of 3 attachments of the deleted channel grill couldn't be removed from the asset store (${Arr.join(ids, ", ")}): The test made this asset store fail to remove.`,
    });
  }).pipe(Effect.provide(testCookout({ assets: "failing-removes" }))),
);
