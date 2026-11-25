import { Array as Arr, Effect, Layer, Option, String as Str } from "effect";
import { HttpServer, HttpServerResponse } from "effect/http";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { nodeHttpServer, serverUrl } from "../../../http/server.ts";
import { request, requestBytes } from "../../../http/client.ts";
import type { Attachment } from "../../index.ts";
import type { HttpResponse } from "../../../http/client.ts";
import { createCookoutClient } from "../../index.ts";
import { isAttachmentId } from "../../../attachments/index.ts";
import { sessionPath } from "../../../identities/index.ts";

const FIRST = 0;
const OK = 200;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const NO_COOKIE = "";
const SANDBOX = "sandbox; default-src 'none'";
const ASSET = "/v1/assets/:id";

function bytesOf(latin1: string): Uint8Array {
  return Uint8Array.from(Str.split("")(latin1), (letter) =>
    Option.getOrElse(Str.codePointAt(FIRST)(letter), () => FIRST),
  );
}

const PNG = bytesOf("\u0089PNG\r\n\u001A\n and the rest");
const JPEG = bytesOf("ÿØÿà and the rest");
const GIF = bytesOf("GIF89a and the rest");
const WEBP = bytesOf("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");
const HTML = bytesOf("<html><script>alert(1)</script></html>");
const SVG = bytesOf('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

interface Posted {
  readonly ann: TestIdentity;
  readonly attachment: Attachment;
}

interface Served {
  readonly bytes: Uint8Array;
  readonly headers: Readonly<Record<string, string | null>>;
}

function posted(cookout: TestCookoutService, name: string, bytes: Uint8Array): Effect.Effect<Posted> {
  return Effect.gen(function* postOne() {
    const ann = yield* cookout.createIdentity("ann", { kind: "human" });
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const { message } = yield* answer(() =>
      ann.client.createMessage({ attachments: [{ bytes, name }], channel: "grill", text: "look" }),
    );
    const [attachment] = message.attachments ?? [];
    return { ann, attachment: Option.getOrThrow(Option.fromNullishOr(attachment)) };
  });
}

function served(cookout: TestCookoutService, asked: string, who: TestIdentity): Effect.Effect<Served> {
  return Effect.map(
    answer(() =>
      requestBytes({
        baseUrl: cookout.url,
        headers: { authorization: `Bearer ${who.token}` },
        method: "GET",
        params: { id: asked },
        path: ASSET,
      }),
    ),
    (answered) => {
      if (!answered.ok) {
        return { bytes: new Uint8Array(), headers: { status: String(answered.response.status) } };
      }
      const { headers } = answered;
      return {
        bytes: answered.bytes,
        headers: {
          "cache-control": headers.get("cache-control"),
          "content-disposition": headers.get("content-disposition"),
          "content-security-policy": headers.get("content-security-policy"),
          "content-type": headers.get("content-type"),
          "x-content-type-options": headers.get("x-content-type-options"),
        },
      };
    },
  );
}

function refused(
  cookout: TestCookoutService,
  asked: string,
  headers: Readonly<Record<string, string>>,
): Effect.Effect<HttpResponse> {
  return answer(() => request({ baseUrl: cookout.url, headers, method: "GET", params: { id: asked }, path: ASSET }));
}

function sessionCookie(cookout: TestCookoutService, who: TestIdentity): Effect.Effect<string> {
  return Effect.map(
    answer(() =>
      request({
        baseUrl: cookout.url,
        headers: { authorization: `Bearer ${who.token}` },
        method: "POST",
        path: sessionPath,
      }),
    ),
    (response) => {
      const [cookie = NO_COOKIE] = response.headers.getSetCookie();
      return Arr.headNonEmpty(Str.split("; ")(cookie));
    },
  );
}

it.effect.each([
  ["a PNG named notes.txt", "notes.txt", PNG, "image/png"],
  ["a JPEG", "photo.jpg", JPEG, "image/jpeg"],
  ["a GIF", "clip.gif", GIF, "image/gif"],
  ["a WebP", "shot.webp", WEBP, "image/webp"],
] as const)("%s is an image by its content, served inline as that type", ([, name, bytes, type]) =>
  Effect.gen(function* imageByContent() {
    const cookout = yield* TestCookout;
    const { ann, attachment } = yield* posted(cookout, name, bytes);
    const answered = yield* served(cookout, attachment.id, ann);

    expect(attachment).toMatchObject({ contentType: type, id: attachment.id, image: true, name, size: bytes.length });
    expect(answered).toStrictEqual({
      bytes,
      headers: {
        "cache-control": "private, max-age=31536000, immutable",
        "content-disposition": `inline; filename="${name}"; filename*=UTF-8''${name}`,
        "content-security-policy": SANDBOX,
        "content-type": type,
        "x-content-type-options": "nosniff",
      },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect.each([
  ["HTML named pic.png", "pic.png", HTML],
  ["an SVG", "logo.svg", SVG],
  ["a text file", "notes.txt", bytesOf("just notes")],
] as const)("%s is no image: it downloads as application/octet-stream, never rendered", ([, name, bytes]) =>
  Effect.gen(function* notAnImage() {
    const cookout = yield* TestCookout;
    const { ann, attachment } = yield* posted(cookout, name, bytes);
    const answered = yield* served(cookout, attachment.id, ann);

    expect(attachment).toMatchObject({ contentType: "application/octet-stream", image: false, name });
    expect(answered).toStrictEqual({
      bytes,
      headers: {
        "cache-control": "private, max-age=31536000, immutable",
        "content-disposition": `attachment; filename="${name}"; filename*=UTF-8''${name}`,
        "content-security-policy": SANDBOX,
        "content-type": "application/octet-stream",
        "x-content-type-options": "nosniff",
      },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a hostile name is a label only: the plain filename is safe ASCII and filename* carries it whole", () =>
  Effect.gen(function* hostileName() {
    const cookout = yield* TestCookout;
    const name = String.raw`..\../etc/passwd; inline; x=1 (é).txt`;
    const { ann, attachment } = yield* posted(cookout, name, HTML);
    const { headers } = yield* served(cookout, attachment.id, ann);

    expect(attachment.name).toBe(name);
    expect(attachment.id).not.toContain("passwd");
    expect(headers["content-disposition"]).toBe(
      "attachment; filename=\".._.._etc_passwd_ inline_ x_1 ___.txt\"; filename*=UTF-8''..%5C..%2Fetc%2Fpasswd%3B%20inline%3B%20x%3D1%20%28%C3%A9%29.txt",
    );
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an attachment's bytes come back through the SDK with its name and type", () =>
  Effect.gen(function* readThroughSdk() {
    const cookout = yield* TestCookout;
    const { ann, attachment } = yield* posted(cookout, "rapport é.pdf", HTML);
    const read = yield* answer(() => ann.client.getAttachment(attachment.id));

    expect(read).toStrictEqual({ bytes: HTML, contentType: "application/octet-stream", name: "rapport é.pdf" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("no credentials and a wrong token are refused, and an unknown ID is 404", () =>
  Effect.gen(function* refusedReaders() {
    const cookout = yield* TestCookout;
    const { ann, attachment } = yield* posted(cookout, "shot.png", PNG);
    const anonymous = yield* refused(cookout, attachment.id, {});
    const wrong = yield* refused(cookout, attachment.id, { authorization: "Bearer cookout_wrong" });
    const missing = yield* refused(cookout, "no-such-attachment", { authorization: `Bearer ${ann.token}` });
    const notAnId = yield* refused(cookout, "not an id!", { authorization: `Bearer ${ann.token}` });

    expect([anonymous.status, wrong.status, missing.status]).toStrictEqual([UNAUTHORIZED, UNAUTHORIZED, NOT_FOUND]);
    expect([missing.json, notAnId.json]).toMatchObject([
      { error: { code: "attachment_not_found" } },
      { error: { code: "attachment_not_found" } },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a deactivated identity's token can no longer read an attachment", () =>
  Effect.gen(function* deactivatedReader() {
    const cookout = yield* TestCookout;
    const { attachment } = yield* posted(cookout, "shot.png", PNG);
    const bob = yield* cookout.createIdentity("bob");
    const before = yield* served(cookout, attachment.id, bob);
    yield* answer(() => cookout.client.deactivateIdentity("bob"));
    const deactivated = yield* refusal(() => bob.client.getAttachment(attachment.id));

    expect(before.bytes).toStrictEqual(PNG);
    expect(deactivated).toMatchObject({ code: "token_revoked", status: UNAUTHORIZED });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the session cookie a browser holds reads an attachment too", () =>
  Effect.gen(function* cookieReader() {
    const cookout = yield* TestCookout;
    const { ann, attachment } = yield* posted(cookout, "shot.png", PNG);
    const cookie = yield* sessionCookie(cookout, ann);
    const answered = yield* refused(cookout, attachment.id, { cookie });

    expect(answered.status).toBe(OK);
  }).pipe(Effect.provide(testCookout())),
);

const bareServer = HttpServer.serve(Effect.succeed(HttpServerResponse.raw(HTML))).pipe(
  Layer.provideMerge(nodeHttpServer({ host: "127.0.0.1", port: 0 })),
);

it.effect("from a server that sends no type and no file name, the SDK reads the bytes with both empty", () =>
  Effect.gen(function* bareAnswer() {
    const server = yield* Layer.build(bareServer);
    const url = yield* Effect.provideContext(serverUrl, server);
    const client = createCookoutClient({ env: {}, token: "cookout_any", url });
    const id = Option.getOrThrow(Option.liftPredicate("a1", isAttachmentId));
    const read = yield* answer(() => client.getAttachment(id));

    expect(read).toStrictEqual({ bytes: HTML, contentType: "", name: "" });
  }).pipe(Effect.scoped),
);
