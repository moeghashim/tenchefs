import { Effect, Option } from "effect";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Attachment } from "../../index.ts";
import type { TestCookoutService } from "../../../testing/server.ts";
import { bannerPng } from "../../../testing/index.ts";

const PNG_WIDTH = 640;
const PNG_HEIGHT = 480;
const JPEG_WIDTH = 1024;
const JPEG_HEIGHT = 768;
const RESTARTED_WIDTH = 32;
const RESTARTED_HEIGHT = 16;
const GIF_WIDTH = 32;
const GIF_HEIGHT = 16;
const LOSSY_WIDTH = 300;
const LOSSY_HEIGHT = 200;
const LOSSLESS_WIDTH = 5;
const LOSSLESS_HEIGHT = 9;
const EXTENDED_WIDTH = 4000;
const EXTENDED_HEIGHT = 3000;
const BANNER_WIDTH = 864;
const BANNER_HEIGHT = 224;

const PNG = "89504e470d0a1a0a0000000d4948445200000280000001e00806000000";
const PNG_CUT_BEFORE_ITS_SIZE = "89504e470d0a1a0a0000000d494844520000";
const JPEG = "ffd8ffe000104a46494600010100000100010000ffffc20011080300040003012200021101031101ffd9";
const JPEG_WITH_NO_FRAME = "ffd8ffe000104a46494600010100000100010000ffda0008010100003f00ffd9";
const JPEG_WITH_A_RESTART_MARKER = "ffd8ffd0ffc0001108001000200301220002110103110100ffd9";
const JPEG_CUT_INSIDE_A_SEGMENT = "ffd8ffe000";
const JPEG_WITH_NO_MARKER_WHERE_ONE_BELONGS = "ffd8ffe0000400000000";
const GIF = "47494638396120001000000000";
const LOSSY_WEBP = "524946461800000057454250565038200c0000000000009d012a2c01c8000000";
const LOSSLESS_WEBP = "5249464612000000574542505650384c060000002f0400020000";
const EXTENDED_WEBP = "524946461600000057454250565038580a000000000000009f0f00b70b00";
const TEXT = "6a757374206e6f746573";
const BANNER = Buffer.from(bannerPng()).toString("hex");

function bytesOf(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

interface Posted {
  readonly attachment: Attachment;
  readonly read: Attachment;
}

function only(attachments: readonly Attachment[] | undefined): Attachment {
  const [attachment] = attachments ?? [];
  return Option.getOrThrow(Option.fromNullishOr(attachment));
}

function postedOne(cookout: TestCookoutService, name: string, hex: string): Effect.Effect<Posted> {
  return Effect.gen(function* postOne() {
    const ann = yield* cookout.createIdentity("ann");
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const { message } = yield* answer(() =>
      ann.client.createMessage({ attachments: [{ bytes: bytesOf(hex), name }], channel: "grill", text: "look" }),
    );
    const thread = yield* answer(() => ann.client.getThread(message.id));
    return { attachment: only(message.attachments), read: only(thread.parent.attachments) };
  });
}

it.effect.each([
  ["a PNG", "shot.png", PNG, PNG_WIDTH, PNG_HEIGHT],
  ["a whole PNG wider than a thumbnail", "banner.png", BANNER, BANNER_WIDTH, BANNER_HEIGHT],
  ["a JPEG", "photo.jpg", JPEG, JPEG_WIDTH, JPEG_HEIGHT],
  [
    "a JPEG with a restart marker before its frame",
    "restart.jpg",
    JPEG_WITH_A_RESTART_MARKER,
    RESTARTED_WIDTH,
    RESTARTED_HEIGHT,
  ],
  ["a GIF", "clip.gif", GIF, GIF_WIDTH, GIF_HEIGHT],
  ["a lossy WebP", "shot.webp", LOSSY_WEBP, LOSSY_WIDTH, LOSSY_HEIGHT],
  ["a lossless WebP", "icon.webp", LOSSLESS_WEBP, LOSSLESS_WIDTH, LOSSLESS_HEIGHT],
  ["an extended WebP", "wide.webp", EXTENDED_WEBP, EXTENDED_WIDTH, EXTENDED_HEIGHT],
] as const)("%s reports its width and height from its header, wherever it is read", ([, name, hex, width, height]) =>
  Effect.gen(function* sizeFromHeader() {
    const cookout = yield* TestCookout;
    const { attachment, read } = yield* postedOne(cookout, name, hex);

    expect(attachment).toMatchObject({ height, image: true, width });
    expect(read).toStrictEqual(attachment);
  }).pipe(Effect.provide(testCookout())),
);

it.effect.each([
  ["a text file", "notes.txt", TEXT, false],
  ["a PNG cut off before its size", "cut.png", PNG_CUT_BEFORE_ITS_SIZE, true],
  ["a JPEG with no frame before its scan", "odd.jpg", JPEG_WITH_NO_FRAME, true],
  ["a JPEG cut off inside a segment", "short.jpg", JPEG_CUT_INSIDE_A_SEGMENT, true],
  ["a JPEG with no marker where one belongs", "broken.jpg", JPEG_WITH_NO_MARKER_WHERE_ONE_BELONGS, true],
] as const)("%s reports neither width nor height", ([, name, hex, image]) =>
  Effect.gen(function* noSize() {
    const cookout = yield* TestCookout;
    const { attachment } = yield* postedOne(cookout, name, hex);

    const { contentType, id, size } = attachment;

    expect(attachment).toStrictEqual({ contentType, id, image, name, size });
  }).pipe(Effect.provide(testCookout())),
);
