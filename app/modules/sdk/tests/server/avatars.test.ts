import { Effect, Option, String as Str } from "effect";
import { TestCookout, answer, refusal, testCookout, watchingAllChannels } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { avatarPng, hillsPng } from "../../../testing/index.ts";
import { expect, it } from "@effect/vitest";
import { request, requestBytes } from "../../../http/client.ts";
import type { AvatarId } from "../../../avatars/index.ts";
import type { HttpResponse } from "../../../http/client.ts";

const FIRST = 0;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const TOO_LARGE = 413;
const OVER_MAXIMUM_BYTES = 2_000_001;
const CUT_AT = 20;
const AVATAR = "/v1/avatars/:id";
const SANDBOX = "sandbox; default-src 'none'";

function bytesOf(latin1: string): Uint8Array {
  return Uint8Array.from(Str.split("")(latin1), (letter) =>
    Option.getOrElse(Str.codePointAt(FIRST)(letter), () => FIRST),
  );
}

function avatarOf(identity: { readonly avatar?: { readonly id: AvatarId } }): AvatarId {
  return Option.getOrThrow(Option.fromNullishOr(identity.avatar)).id;
}

interface Served {
  readonly bytes: Uint8Array;
  readonly headers: Readonly<Record<string, string | null>>;
}

function served(cookout: TestCookoutService, avatar: AvatarId, who: TestIdentity): Effect.Effect<Served> {
  return Effect.map(
    answer(() =>
      requestBytes({
        baseUrl: cookout.url,
        headers: { authorization: `Bearer ${who.token}` },
        method: "GET",
        params: { id: avatar },
        path: AVATAR,
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

function signedIn(who: TestIdentity): Readonly<Record<string, string>> {
  return { authorization: `Bearer ${who.token}` };
}

function asked(
  cookout: TestCookoutService,
  requested: string,
  headers: Readonly<Record<string, string>>,
): Effect.Effect<HttpResponse> {
  return answer(() =>
    request({ baseUrl: cookout.url, headers, method: "GET", params: { id: requested }, path: AVATAR }),
  );
}

it.effect("a person sets their own avatar: every listing carries it, and its PNG is served inline", () =>
  Effect.gen(function* ownAvatar() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    const { identity } = yield* answer(() => ada.client.setAvatar("ada", avatarPng()));
    const [got, listed, whoami] = yield* Effect.all(
      [answer(() => grace.client.getIdentity("ada")), answer(grace.client.listIdentities), answer(ada.client.whoami)],
      { concurrency: 1 },
    );
    const answered = yield* served(cookout, avatarOf(identity), grace);

    expect(identity).toStrictEqual({ ...ada.identity, avatar: { id: avatarOf(identity) } });
    expect([got.identity, whoami.identity, listed.identities]).toStrictEqual([
      identity,
      identity,
      expect.arrayContaining([identity]),
    ]);
    expect(answered).toStrictEqual({
      bytes: avatarPng(),
      headers: {
        "cache-control": "private, max-age=31536000, immutable",
        "content-disposition": "inline",
        "content-security-policy": SANDBOX,
        "content-type": "image/png",
        "x-content-type-options": "nosniff",
      },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent sets its own avatar, and its owner sets it from their own Login", () =>
  Effect.gen(function* agentAvatar() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const bot = yield* cookout.createIdentity("todo-bot", { owner: "ada" });
    const byItself = yield* answer(() => bot.client.setAvatar("todo-bot", avatarPng()));
    const byOwner = yield* answer(() => ada.client.setAvatar("todo-bot", avatarPng()));

    expect([byItself.identity, byOwner.identity]).toMatchObject([
      { avatar: { id: avatarOf(byItself.identity) }, name: "todo-bot" },
      { avatar: { id: avatarOf(byOwner.identity) }, name: "todo-bot" },
    ]);
    expect(avatarOf(byOwner.identity)).not.toBe(avatarOf(byItself.identity));
  }).pipe(Effect.provide(testCookout())),
);

it.effect("anyone else setting an avatar is refused with 403 not_owner, an admin too, and nothing changes", () =>
  Effect.gen(function* strangers() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    yield* cookout.createIdentity("todo-bot", { owner: "ada" });
    const other = yield* cookout.createIdentity("other-bot", { owner: "ada" });
    const refusals = yield* Effect.all(
      [
        refusal(() => grace.client.setAvatar("ada", avatarPng())),
        refusal(() => grace.client.setAvatar("todo-bot", avatarPng())),
        refusal(() => other.client.setAvatar("todo-bot", avatarPng())),
        refusal(() => cookout.client.setAvatar("ada", avatarPng())),
        refusal(() => ada.client.setAvatar("nobody", avatarPng())),
      ],
      { concurrency: 1 },
    );
    const got = yield* answer(() => grace.client.getIdentity("ada"));

    expect(refusals).toMatchObject([
      { code: "not_owner", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
      { code: "identity_not_found", status: NOT_FOUND },
    ]);
    expect(got).toStrictEqual({ identity: ada.identity });
  }).pipe(Effect.provide(testCookout())),
);

it.effect.each([
  ["an SVG", bytesOf('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "avatar_not_png"],
  ["HTML", bytesOf("<html><script>alert(1)</script></html>"), "avatar_not_png"],
  ["a JPEG", bytesOf("ÿØÿà and the rest"), "avatar_not_png"],
  ["a PNG cut off before its header ends", avatarPng().subarray(FIRST, CUT_AT), "avatar_not_png"],
  ["a 480 by 320 PNG", hillsPng(), "avatar_wrong_size"],
] as const)("%s is refused with 400, judged by its content alone", ([, bytes, code]) =>
  Effect.gen(function* badContent() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const refused = yield* refusal(() => ada.client.setAvatar("ada", bytes));
    const got = yield* answer(ada.client.whoami);

    expect(refused).toMatchObject({ code, status: BAD_REQUEST });
    expect(got).toStrictEqual({ identity: ada.identity });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an avatar over 2 MB is refused with 413 avatar_too_large", () =>
  Effect.gen(function* tooLarge() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const large = new Uint8Array(OVER_MAXIMUM_BYTES);
    large.set(avatarPng());
    const refused = yield* refusal(() => ada.client.setAvatar("ada", large));

    expect(refused).toMatchObject({ code: "avatar_too_large", status: TOO_LARGE });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("replacing an avatar deletes the old one: its ID gives 404 and the store holds no bytes for it", () =>
  Effect.gen(function* replaced() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const first = yield* answer(() => ada.client.setAvatar("ada", avatarPng()));
    const second = yield* answer(() => ada.client.setAvatar("ada", avatarPng()));
    const [oldId, newId] = [avatarOf(first.identity), avatarOf(second.identity)];
    const gone = yield* asked(cookout, oldId, { authorization: `Bearer ${ada.token}` });
    const held = yield* cookout.heldAssets([oldId, newId]);

    expect(gone.status).toBe(NOT_FOUND);
    expect(gone.json).toMatchObject({ error: { code: "avatar_not_found" } });
    expect(held).toStrictEqual([newId]);
  }).pipe(Effect.provide(testCookout({ storage: "sqlite" }))),
);

it.effect("an avatar is refused without credentials and to a Deactivated identity, and an unknown ID is 404", () =>
  Effect.gen(function* refusedReaders() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const bob = yield* cookout.createIdentity("bob");
    const { identity } = yield* answer(() => ada.client.setAvatar("ada", avatarPng()));
    const [anonymous, unknown, notAnId] = yield* Effect.all(
      [
        asked(cookout, avatarOf(identity), {}),
        asked(cookout, "no-such-avatar", signedIn(ada)),
        asked(cookout, "not an id!", signedIn(ada)),
      ],
      { concurrency: 1 },
    );
    yield* answer(() => cookout.client.deactivateIdentity("bob"));
    const deactivated = yield* asked(cookout, avatarOf(identity), { authorization: `Bearer ${bob.token}` });
    const setting = yield* refusal(() => bob.client.setAvatar("bob", avatarPng()));

    expect([anonymous.status, unknown.status, notAnId.status, deactivated.status]).toStrictEqual([
      UNAUTHORIZED,
      NOT_FOUND,
      NOT_FOUND,
      UNAUTHORIZED,
    ]);
    expect(setting).toMatchObject({ status: UNAUTHORIZED });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("setting an avatar reaches every all-channels watcher at once as an identity event", () =>
  Effect.gen(function* liveChange() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const grace = yield* cookout.createIdentity("grace", { kind: "human" });
    const events = yield* watchingAllChannels(grace);
    const { identity } = yield* answer(() => ada.client.setAvatar("ada", avatarPng()));
    const event = yield* answer(() => events.next());

    expect(event).toStrictEqual({ done: false, value: { identity, type: "identity" } });
  }).pipe(Effect.provide(testCookout())),
);
