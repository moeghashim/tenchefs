import { Effect, Option } from "effect";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { HttpResponse } from "../../../http/client.ts";
import { avatarPng } from "../../../testing/index.ts";
import { request } from "../../../http/client.ts";

const OK = 200;
const BAD_REQUEST = 400;
const IDENTITY_AVATAR = "/v1/identities/:name/avatar";

function pngBlob(): Blob {
  return new Blob([Uint8Array.from(avatarPng())], { type: "image/png" });
}

function put(cookout: TestCookoutService, who: TestIdentity, body: unknown): Effect.Effect<HttpResponse> {
  return answer(() =>
    request({
      baseUrl: cookout.url,
      body,
      headers: { authorization: `Bearer ${who.token}` },
      method: "PUT",
      params: { name: who.identity.name },
      path: IDENTITY_AVATAR,
    }),
  );
}

function formOf(parts: readonly (readonly [string, string | Blob])[]): FormData {
  const form = new FormData();
  for (const [key, value] of parts) {
    form.append(key, value);
  }
  return form;
}

it.effect("an upload's other parts are skipped, and only its first avatar file part is taken", () =>
  Effect.gen(function* otherParts() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const sent = formOf([
      ["note", "hello"],
      ["picture", pngBlob()],
      ["avatar", pngBlob()],
      ["avatar", new Blob(["not a png"])],
    ]);
    const answered = yield* put(cookout, ada, sent);
    const { identity } = yield* answer(ada.client.whoami);

    expect(answered.status).toBe(OK);
    expect(Option.isSome(Option.fromNullishOr(identity.avatar))).toBe(true);
  }).pipe(Effect.provide(testCookout())),
);

it.effect.each([
  ["a form with no avatar file part", formOf([["avatar", "just text"]])],
  ["a JSON body", { avatar: "not multipart" }],
] as const)("%s is refused with 400 invalid_request", ([, body]) =>
  Effect.gen(function* missingPart() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const answered = yield* put(cookout, ada, body);

    expect(answered).toMatchObject({ json: { error: { code: "invalid_request" } }, status: BAD_REQUEST });
  }).pipe(Effect.provide(testCookout())),
);
