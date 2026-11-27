import { Array as Arr, Effect } from "effect";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { request } from "../../../http/client.ts";
import { whoamiPath } from "../../../identities/index.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;

type Client = TestIdentity["client"];

function cliSession(cookout: TestCookoutService, approver: Client, host: string): Effect.Effect<string> {
  return Effect.gen(function* approvedLogin() {
    const started = yield* answer(() => cookout.clientFor().startLogin({ host }));
    yield* answer(() => approver.approveLogin(started.userCode));
    const collected = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));
    if (collected.status === "approved") {
      return collected.token;
    }
    return expect.unreachable("The login was not approved.");
  });
}

function statusWith(url: string, token: string): Effect.Effect<number> {
  return Effect.map(
    answer(() =>
      request({ baseUrl: url, headers: { authorization: `Bearer ${token}` }, method: "GET", path: whoamiPath }),
    ),
    ({ status }) => status,
  );
}

interface Devices {
  readonly laptop: string;
  readonly desktop: string;
  readonly phone: string;
  readonly chiefSession: string;
}

function devicesOf(cookout: TestCookoutService, ada: TestIdentity): Effect.Effect<Devices> {
  return Effect.gen(function* approveDevices() {
    const laptop = yield* cliSession(cookout, ada.client, "ada-laptop");
    const desktop = yield* cliSession(cookout, cookout.clientFor(laptop), "ada-desktop");
    const phone = yield* cliSession(cookout, cookout.clientFor(desktop), "ada-phone");
    yield* cookout.createIdentity("chief", { owner: "ada" });
    const joined = yield* answer(() => cookout.clientFor(laptop).join({ as: "chief" }));
    yield* answer(() => cookout.clientFor(laptop).createJoinCode({ displayName: "Worker", name: "worker" }));
    return { chiefSession: joined.agentSessionToken, desktop, laptop, phone };
  });
}

it.effect("Log out everywhere's preview counts what it then ends, and only the session it was sent from stays", () =>
  Effect.gen(function* loggedOutEverywhere() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const { chiefSession, desktop, laptop, phone } = yield* devicesOf(cookout, ada);
    const fromPhone = cookout.clientFor(phone);
    const preview = yield* answer(() => fromPhone.previewLogOutEverywhere());
    const before = yield* Effect.forEach([laptop, desktop, chiefSession], (sent) => statusWith(cookout.url, sent), {
      concurrency: 1,
    });
    const answered = yield* answer(() => fromPhone.logOutEverywhere());
    const after = yield* Effect.forEach(
      [laptop, desktop, chiefSession, phone],
      (sent) => statusWith(cookout.url, sent),
      { concurrency: 1 },
    );
    const { sessions } = yield* answer(() => fromPhone.listSessions());

    expect({
      after,
      answered,
      before,
      left: Arr.map(sessions, (session) => ({ current: session.current, madeBy: "madeBy" in session })),
      preview,
    }).toStrictEqual({
      after: [UNAUTHORIZED, UNAUTHORIZED, UNAUTHORIZED, OK],
      answered: { ended: { agentSessions: 1, joinCodes: 1, sessions: 2 } },
      before: [OK, OK, OK],
      left: [{ current: true, madeBy: false }],
      preview: { willEnd: { agentSessions: 1, joinCodes: 1, sessions: 2 } },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent can't log out everywhere or preview it: it is 403 human_only", () =>
  Effect.gen(function* agentRefused() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    const chief = yield* cookout.createIdentity("chief", { owner: "ada" });
    const refused = yield* Effect.all(
      [refusal(() => chief.client.previewLogOutEverywhere()), refusal(() => chief.client.logOutEverywhere())],
      { concurrency: 1 },
    );

    expect(refused).toMatchObject([
      { code: "human_only", status: FORBIDDEN },
      { code: "human_only", status: FORBIDDEN },
    ]);
  }).pipe(Effect.provide(testCookout())),
);
