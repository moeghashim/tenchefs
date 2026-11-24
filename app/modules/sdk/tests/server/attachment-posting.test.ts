import { Array as Arr, Effect, Option, Record as Rec, String as Str } from "effect";
import type { CookoutEvent, EventStream, NewAttachment } from "../../index.ts";
import { TestCookout, answer, newMessageFixture, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Attachment } from "../../../attachments/index.ts";
import type { HttpResponse } from "../../../http/client.ts";
import type { Scope } from "effect";
import { isAttachmentId } from "../../../attachments/index.ts";
import { request } from "../../../http/client.ts";

const BAD_REQUEST = 400;
const TOO_LARGE = 413;
const LIMIT = 10;
const OVER_LIMIT = 11;
const OVER_MAXIMUM_BYTES = 10_000_001;
const FILL = 7;
const ONE = 1;
const NONE = 0;
const OVER_A_MEBIBYTE = 1_048_577;
const OVER_LONGEST_NAME = 256;
const ONE_AT_A_TIME = { concurrency: 1 } as const;

interface Board {
  readonly ann: TestIdentity;
  readonly bob: TestIdentity;
}

function board(cookout: TestCookoutService): Effect.Effect<Board> {
  return Effect.gen(function* boardWithTwo() {
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    return { ann, bob };
  });
}

function file(name: string, size = FILL): NewAttachment {
  return { bytes: new Uint8Array(size).fill(FILL), name };
}

const TEN: readonly NewAttachment[] = Arr.makeBy(LIMIT, (index) => file(`part-${String(index)}.bin`, index + ONE));
const SHOT: Attachment = {
  contentType: "application/octet-stream",
  id: Option.getOrThrow(Option.liftPredicate("shot-id", isAttachmentId)),
  image: false,
  name: "shot.bin",
  size: FILL,
};
const ELEVEN: readonly NewAttachment[] = Arr.makeBy(OVER_LIMIT, (index) => file(`f${String(index)}.bin`));

function watching(who: TestIdentity): Effect.Effect<AsyncIterator<CookoutEvent>, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => who.client.watch({ allChannels: true })),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

it.effect("ten attachments post in order, read back byte for byte, and arrive on the live feed", () =>
  Effect.scoped(
    Effect.gen(function* tenPosted() {
      const cookout = yield* TestCookout;
      const { ann, bob } = yield* board(cookout);
      const events = yield* watching(bob);
      const { message } = yield* answer(() =>
        ann.client.createMessage({ attachments: TEN, channel: "grill", text: "ten files" }),
      );
      const event = yield* answer(() => events.next());
      const read = yield* Effect.forEach(
        message.attachments ?? [],
        ({ id }) => answer(() => bob.client.getAttachment(id)),
        ONE_AT_A_TIME,
      );

      expect(Arr.map(message.attachments ?? [], ({ name, size }) => ({ name, size }))).toStrictEqual(
        Arr.map(TEN, ({ bytes, name }) => ({ name, size: bytes.length })),
      );
      expect(Arr.map(read, ({ bytes }) => bytes)).toStrictEqual(Arr.map(TEN, ({ bytes }) => bytes));
      expect(event).toStrictEqual({ done: false, value: { message, type: "message" } });
    }),
  ).pipe(Effect.provide(testCookout())),
);

it.effect("a channel page, the thread, the inbox and search all list a message's attachments", () =>
  Effect.gen(function* listedEverywhere() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const { message } = yield* answer(() =>
      ann.client.createMessage({ attachments: TEN, channel: "grill", text: "@bob deploy notes" }),
    );
    const page = yield* answer(() => bob.client.listMessages("grill"));
    const thread = yield* answer(() => bob.client.getThread(message.id));
    const { items } = yield* answer(() => bob.client.inbox());
    const found = yield* answer(() => bob.client.search({ query: "deploy" }));
    const { attachments } = message;

    expect([page.messages, [thread.parent]]).toMatchObject([[{ attachments }], [{ attachments }]]);
    expect([items, found.results]).toMatchObject([[{ message: { attachments } }], [{ message: { attachments } }]]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a message with attachments and no text is refused for now, yet one stored that way reads back", () =>
  Effect.gen(function* attachmentsOnly() {
    const cookout = yield* TestCookout;
    const { ann } = yield* board(cookout);
    const refused = yield* refusal(() =>
      ann.client.createMessage({ attachments: [file("shot.bin")], channel: "grill", text: "" }),
    );
    const stored = yield* cookout.seedMessage({
      ...newMessageFixture("grill", "", { author: { name: "ann" } }),
      attachments: [SHOT],
    });
    const page = yield* answer(() => ann.client.listMessages("grill"));
    const thread = yield* answer(() => ann.client.getThread(stored.id));

    expect(refused).toMatchObject({ code: "message_empty", status: BAD_REQUEST });
    expect([page.messages, thread.parent]).toMatchObject([[{ attachments: [SHOT], text: "" }], { text: "" }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a message with neither text nor attachments is refused, as JSON or multipart", () =>
  Effect.gen(function* neitherRefused() {
    const cookout = yield* TestCookout;
    const { ann } = yield* board(cookout);
    const form = new FormData();
    form.append("message", '{"channel":"grill"}');
    const multipart = yield* answer(() =>
      request({
        baseUrl: cookout.url,
        body: form,
        headers: { authorization: `Bearer ${ann.token}` },
        method: "POST",
        path: "/v1/messages",
      }),
    );
    const json = yield* refusal(() => ann.client.createMessage({ channel: "grill", text: "" }));

    expect([multipart.status, multipart.json]).toMatchObject([BAD_REQUEST, { error: { code: "message_empty" } }]);
    expect(json).toMatchObject({ status: BAD_REQUEST });
  }).pipe(Effect.provide(testCookout())),
);

it.effect.each([
  ["a file over 10 MB", [file("big.bin", OVER_MAXIMUM_BYTES)], TOO_LARGE, "attachment_too_large"],
  ["eleven files", ELEVEN, BAD_REQUEST, "too_many_attachments"],
  ["an empty file", [file("empty.bin", NONE)], BAD_REQUEST, "attachment_empty"],
] as const)("%s is refused whole, leaving no message and no bytes", ([, attachments, status, code]) =>
  Effect.gen(function* refusedWhole() {
    const cookout = yield* TestCookout;
    const { ann } = yield* board(cookout);
    const refused = yield* refusal(() => ann.client.createMessage({ attachments, channel: "grill", text: "files" }));
    const page = yield* answer(() => ann.client.listMessages("grill"));

    expect(refused).toMatchObject({ code, status });
    expect(page.messages).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an attachment part that is not a file, or whose name is over 255 characters, is refused as unnamed", () =>
  Effect.gen(function* unnamedPart() {
    const cookout = yield* TestCookout;
    const { ann } = yield* board(cookout);
    const form = new FormData();
    form.append("message", '{"channel":"grill","text":"files"}');
    form.append("attachment", "not a file");
    const refused = yield* answer(() =>
      request({
        baseUrl: cookout.url,
        body: form,
        headers: { authorization: `Bearer ${ann.token}` },
        method: "POST",
        path: "/v1/messages",
      }),
    );

    const longName = yield* refusal(() =>
      ann.client.createMessage({
        attachments: [file(Str.repeat(OVER_LONGEST_NAME)("n"))],
        channel: "grill",
        text: "x",
      }),
    );

    expect([refused.status, refused.json]).toMatchObject([BAD_REQUEST, { error: { code: "attachment_unnamed" } }]);
    expect(longName).toMatchObject({ code: "attachment_unnamed", status: BAD_REQUEST });
  }).pipe(Effect.provide(testCookout())),
);

interface RawPost {
  readonly body?: FormData;
  readonly headers?: Readonly<Record<string, string>>;
}

function rawPost(cookout: TestCookoutService, who: TestIdentity): (sent: RawPost) => Effect.Effect<HttpResponse> {
  return (sent) =>
    answer(() =>
      request({
        ...sent,
        baseUrl: cookout.url,
        headers: { authorization: `Bearer ${who.token}`, ...sent.headers },
        method: "POST",
        path: "/v1/messages",
      }),
    );
}

function formOf(parts: Readonly<Record<string, string | Blob>>): FormData {
  const form = new FormData();
  for (const [key, value] of Rec.toEntries(parts)) {
    form.append(key, value);
  }
  return form;
}

it.effect("a multipart post with no message part, a message part over 1 MiB or a broken body is refused", () =>
  Effect.gen(function* brokenMultipart() {
    const cookout = yield* TestCookout;
    const { ann } = yield* board(cookout);
    const noMessage = formOf({ attachment: new File([new Uint8Array(FILL)], "a.bin"), note: "ignored" });
    const hugeMessage = formOf({ message: Str.repeat(OVER_A_MEBIBYTE)("x") });
    const noBoundary = { body: formOf({ message: "{}" }), headers: { "content-type": "multipart/form-data" } };
    const answers = yield* Effect.forEach(
      [{ body: noMessage }, { body: hugeMessage }, noBoundary, {}],
      rawPost(cookout, ann),
      ONE_AT_A_TIME,
    );

    expect(Arr.map(answers, ({ json, status }) => [status, json])).toMatchObject([
      [BAD_REQUEST, { error: { code: "invalid_request" } }],
      [TOO_LARGE, { error: { code: "body_too_large" } }],
      [BAD_REQUEST, { error: { code: "invalid_request" } }],
      [BAD_REQUEST, { error: {} }],
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a post refused after its bytes were stored takes them back out", () =>
  Effect.gen(function* refusedTakesBytesBack() {
    const cookout = yield* TestCookout;
    const { ann } = yield* board(cookout);
    const refused = yield* refusal(() =>
      ann.client.createMessage({ attachments: [file("a.bin")], channel: "no-such-channel", text: "files" }),
    );
    const { message } = yield* answer(() =>
      ann.client.createMessage({ attachments: [file("b.bin")], channel: "grill", text: "files" }),
    );

    expect(refused).toMatchObject({ code: "channel_not_found" });
    expect(message.attachments).toHaveLength(ONE);
  }).pipe(Effect.provide(testCookout())),
);
