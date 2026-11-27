import { Array as Arr, Effect, String as Str } from "effect";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { harnessHeader, sessionPath } from "../../../identities/index.ts";
import type { HttpResponse } from "../../../http/client.ts";
import { loginRequestApprovalPath } from "../../../logins/index.ts";
import { request } from "../../../http/client.ts";

const FORBIDDEN = 403;
const FIRST_LOGIN = { host: "laptop" } as const;
const NO_COOKIE = "";

function sessionCookie(url: string, token: string): Effect.Effect<string> {
  return Effect.map(
    answer(() =>
      request({ baseUrl: url, headers: { authorization: `Bearer ${token}` }, method: "POST", path: sessionPath }),
    ),
    (response) => {
      const [cookie = NO_COOKIE] = response.headers.getSetCookie();
      return Arr.headNonEmpty(Str.split("; ")(cookie));
    },
  );
}

function approveFromHarness(
  url: string,
  userCode: string,
  credential: Readonly<Record<string, string>>,
): Effect.Effect<HttpResponse> {
  return answer(() =>
    request({
      baseUrl: url,
      headers: { ...credential, [harnessHeader]: "claude-code" },
      method: "PUT",
      path: Str.replace(":code", userCode)(loginRequestApprovalPath),
    }),
  );
}

it.effect("approving a Login request with the harness header is refused, with a person's token or session", () =>
  Effect.gen(function* approvalFromHarness() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const started = yield* answer(() => cookout.clientFor().startLogin(FIRST_LOGIN));
    const cookie = yield* sessionCookie(cookout.url, ada.token);

    const byToken = yield* approveFromHarness(cookout.url, started.userCode, {
      authorization: `Bearer ${ada.token}`,
    });
    const bySession = yield* approveFromHarness(cookout.url, started.userCode, { cookie });
    const collected = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));

    expect([byToken, bySession]).toMatchObject([
      { json: { error: { code: "agent_as_human" } }, status: FORBIDDEN },
      { json: { error: { code: "agent_as_human" } }, status: FORBIDDEN },
    ]);
    expect(collected).toMatchObject({ status: "pending" });
  }).pipe(Effect.provide(testCookout())),
);
