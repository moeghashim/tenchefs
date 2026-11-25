import { Array as Arr, Effect, FileSystem, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import {
  answer,
  commandLineServices,
  interruptDevBinary,
  runCookout,
  runDev,
  startDev,
  startFakeRoutine,
  startProbedDev,
} from "../../../testing/server.ts";
import { clockForwardPath, relayCutPath, relayRestorePath } from "../../../http/index.ts";
import { expect, it } from "@effect/vitest";
import { moveClockForward, testClient } from "../../../testing/index.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { DevProcess } from "../../../testing/server.ts";

interface Fetched {
  readonly status: number;
  readonly text: string;
}

const OK = 200;
const NO_CONTENT = 204;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const THREE_REPLIES = 3;
const NOT_FOUND = 404;
const QUIET_DAYS = 3;
const NONE = 0;
const SeededToken = Schema.Struct({ token: Schema.String });
const SeedOutput = Schema.Struct({ identities: Schema.NonEmptyArray(SeededToken), thread: Schema.Finite });
const ThreadParent = Schema.Struct({ text: Schema.String });
const FireAnswer = Schema.fromJsonString(
  Schema.Struct({ claude_code_session_url: Schema.String, type: Schema.String }),
);
const ThreadOutput = Schema.Struct({ parent: ThreadParent, replies: Schema.Array(Schema.Unknown) });

function shaped<Shape>(value: unknown, isShape: (input: unknown) => input is Shape, otherwise: string): Shape {
  if (isShape(value)) {
    return value;
  }
  return expect.unreachable(otherwise);
}

function databaseExists(database: string): Effect.Effect<boolean, never, FileSystem.FileSystem> {
  return Effect.gen(function* checkDatabase() {
    const fs = yield* FileSystem.FileSystem;
    return yield* Effect.orDie(fs.exists(database));
  });
}

function postedStatus(url: string, path: string): Effect.Effect<number> {
  return HttpClient.execute(HttpClientRequest.post(`${url}${path}`)).pipe(
    Effect.map(({ status }) => status),
    Effect.provide(FetchHttpClient.layer),
    Effect.orDie,
  );
}

function fetchedText(url: string): Effect.Effect<Fetched> {
  return Effect.gen(function* fetchText() {
    const response = yield* HttpClient.execute(HttpClientRequest.get(url));
    const text = yield* response.text;
    return { status: response.status, text };
  }).pipe(Effect.provide(FetchHttpClient.layer), Effect.orDie);
}

function policyOf(url: string): Effect.Effect<string | undefined> {
  return HttpClient.execute(HttpClientRequest.get(url)).pipe(
    Effect.map((response) => response.headers["content-security-policy"]),
    Effect.provide(FetchHttpClient.layer),
    Effect.orDie,
  );
}

function postedFrom(origin: string, url: string): Effect.Effect<string> {
  return HttpClient.execute(HttpClientRequest.post(url).pipe(HttpClientRequest.setHeader("origin", origin))).pipe(
    Effect.flatMap((response) => response.text),
    Effect.provide(FetchHttpClient.layer),
    Effect.orDie,
  );
}

function postedJson(url: string): Effect.Effect<unknown> {
  return HttpClient.execute(HttpClientRequest.post(url)).pipe(
    Effect.flatMap((response) => response.json),
    Effect.provide(FetchHttpClient.layer),
    Effect.orDie,
  );
}

it.effect("pnpm dev serves a fresh board and a webhook fake, and removes its database when it stops", () =>
  Effect.gen(function* devServesAndCleansUp() {
    const dev = yield* startDev;
    const { identity } = yield* answer(() => testClient({ env: {}, token: dev.adminToken, url: dev.url }).whoami());
    const fakeStatus = yield* postedStatus(dev.webhookFakeUrl, "/command");
    const keptWhileRunning = yield* databaseExists(dev.database);
    yield* dev.stop;
    const keptAfterStop = yield* databaseExists(dev.database);

    expect(identity.name).toBe("admin");
    expect(fakeStatus).toBe(OK);
    expect(keptWhileRunning).toBe(true);
    expect(keptAfterStop).toBe(false);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("pnpm dev serves the web UI from the Vite dev server, which passes /v1 on to the cookout", () =>
  Effect.gen(function* devServesTheWebUi() {
    const dev = yield* startDev;
    const page = yield* fetchedText(dev.webUrl);
    const health = yield* fetchedText(`${dev.webUrl}/v1/health`);

    expect([page.status, health.status]).toStrictEqual([OK, OK]);
    expect(page.text).toContain('src="/app/web.tsx"');
    expect(page.text).not.toContain("/app/modules/probe/web.ts");
    expect(health.text).toContain('"status":"ok"');
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("pnpm dev's web UI carries the live board's CSP, the one every cookout response carries", () =>
  Effect.gen(function* devServesTheLiveCsp() {
    const dev = yield* startDev;
    const page = yield* policyOf(dev.webUrl);
    const script = yield* policyOf(`${dev.webUrl}/app/web.tsx`);
    const live = yield* policyOf(`${dev.url}/v1/health`);

    expect(live).toContain("default-src 'none'");
    expect([page, script]).toStrictEqual([live, live]);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("pnpm dev start --probe puts the browser tests' probe on the web UI's page ahead of the app", () =>
  Effect.gen(function* devServesTheProbe() {
    const dev = yield* startProbedDev;
    const page = yield* fetchedText(dev.webUrl);

    expect(page.text).toMatch(/src="\/app\/modules\/probe\/web\.ts"[\s\S]*src="\/app\/web\.tsx"/u);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("pnpm dev serves the web UI through a relay too, which a browser test can cut and restore", () =>
  Effect.gen(function* devServesARelay() {
    const dev = yield* startDev;
    const cut = yield* postedStatus(dev.relayUrl, relayCutPath);
    const restored = yield* postedStatus(dev.relayUrl, relayRestorePath);
    const page = yield* fetchedText(dev.relayUrl);

    expect([cut, restored, page.status]).toStrictEqual([NO_CONTENT, NO_CONTENT, OK]);
    expect(page.text).toContain('src="/app/web.tsx"');
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("a write from the web UI's page passes the Origin guard through the Vite dev server", () =>
  Effect.gen(function* devWebWrites() {
    const dev = yield* startDev;
    const fromPage = yield* postedFrom(dev.webUrl, `${dev.webUrl}/v1/channels`);

    expect(fromPage).toContain('"token_missing"');
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("pnpm seed prints the seeded tokens, and the cookout CLI reads the seeded thread with one", () =>
  Effect.gen(function* seedThenReadThread() {
    const dev = yield* startDev;
    const seeded = yield* runDev({ args: ["seed"], env: { COOKOUT_TOKEN: dev.adminToken, COOKOUT_URL: dev.url } });
    const board = shaped(seeded.stdoutJson, Schema.is(SeedOutput), seeded.stderr);
    const [first] = board.identities;
    const read = yield* runCookout({
      args: ["thread", "get", String(board.thread)],
      env: { COOKOUT_TOKEN: first.token, COOKOUT_URL: dev.url },
    });
    const thread = shaped(read.stdoutJson, Schema.is(ThreadOutput), read.stderr);

    expect(seeded.exitCode).toBe(EXIT_SUCCESS);
    expect(thread.parent.text).toBe("Morning! Who is looking at the flaky login test?");
    expect(thread.replies).toHaveLength(THREE_REPLIES);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("pnpm seed without COOKOUT_URL and COOKOUT_TOKEN is refused as JSON on stderr", () =>
  Effect.gen(function* seedWithoutConnection() {
    const seeded = yield* runDev({ args: ["seed"], env: {} });

    expect(seeded.exitCode).toBe(EXIT_FAILURE);
    expect(seeded.stderrJson).toStrictEqual({
      error: {
        code: "url_missing",
        message: "Set COOKOUT_URL and COOKOUT_TOKEN to the url and adminToken that pnpm dev printed.",
      },
    });
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("pnpm seed on a board it already seeded is refused with the server's code", () =>
  Effect.gen(function* seedTwice() {
    const dev = yield* startDev;
    const env = { COOKOUT_TOKEN: dev.adminToken, COOKOUT_URL: dev.url };
    yield* runDev({ args: ["seed"], env });
    const again = yield* runDev({ args: ["seed"], env });

    expect(again.exitCode).toBe(EXIT_FAILURE);
    expect(again.stderrJson).toStrictEqual({
      error: { code: "identity_exists", message: "The name ada is taken." },
    });
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("pnpm seed against a stopped cookout is refused", () =>
  Effect.gen(function* seedStoppedCookout() {
    const dev = yield* startDev;
    yield* dev.stop;
    const seeded = yield* runDev({ args: ["seed"], env: { COOKOUT_TOKEN: dev.adminToken, COOKOUT_URL: dev.url } });

    expect(seeded.exitCode).toBe(EXIT_FAILURE);
    expect(seeded.stderrJson).toMatchObject({ error: { code: "seed_failed" } });
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("pnpm dev exits 0 on Ctrl-C and deletes its database", () =>
  Effect.gen(function* devStopsOnInterrupt() {
    const { database, exitCode } = yield* interruptDevBinary();
    const kept = yield* databaseExists(database);

    expect(database).toContain("cookout-dev-");
    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(kept).toBe(false);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("the dev program refuses a command it doesn't have", () =>
  Effect.gen(function* unknownDevCommand() {
    const result = yield* runDev({ args: ["deploy"], env: {} });

    expect(result.exitCode).toBe(EXIT_FAILURE);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("the dev program's fake routine answers a fire as a routine does, naming its session", () =>
  Effect.gen(function* fakeRoutineFires() {
    const routine = yield* startFakeRoutine;
    const fired = yield* postedJson(routine.fireUrl);
    const answered = shaped(fired, Schema.is(FireAnswer), "The fake routine named no session.");

    expect(routine.fireUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1\/claude_code\/routines\/.+\/fire$/u);
    expect(answered).toMatchObject({ claude_code_session_url: routine.sessionUrl, type: "routine_fire" });
  }).pipe(Effect.provide(commandLineServices)),
);

function threadStartedOn(dev: DevProcess): Effect.Effect<CookoutClient> {
  return Effect.gen(function* startThread() {
    const admin = testClient({ env: {}, token: dev.adminToken, url: dev.url });
    yield* answer(() => admin.createChannel({ name: "release" }));
    const { token } = yield* answer(() => admin.createIdentity({ kind: "human", name: "ada" }));
    const ada = testClient({ env: {}, token, url: dev.url });
    yield* answer(() => ada.createMessage({ channel: "release", text: "Who owns the release notes?" }));
    return ada;
  });
}

it.effect(
  "pnpm dev's clock moves forward when told, and the nudge job raises a nudge for a thread quiet that long",
  () =>
    Effect.gen(function* devClockMovesForward() {
      const dev = yield* startDev;
      const ada = yield* threadStartedOn(dev);
      const before = yield* answer(() => ada.inbox());
      yield* Effect.promise(() => moveClockForward({ clockUrl: dev.clockUrl, days: QUIET_DAYS }));
      const after = yield* Effect.repeat(
        answer(() => ada.inbox()),
        { until: ({ nudges }) => nudges.length > NONE },
      );

      expect(before.nudges).toStrictEqual([]);
      expect(Arr.map(after.nudges, ({ text }) => text)).toStrictEqual(["Quiet for 3 days: close it, or follow up?"]);
    }).pipe(Effect.provide(commandLineServices)),
);

it.effect("pnpm dev's clock refuses a move backwards, and answers 404 off its one path", () =>
  Effect.gen(function* devClockRefuses() {
    const dev = yield* startDev;
    const backwards = yield* Effect.flip(
      Effect.tryPromise({
        catch: String,
        try: () => moveClockForward({ clockUrl: dev.clockUrl, days: -1 }),
      }),
    );
    const elsewhere = yield* fetchedText(`${dev.clockUrl}${clockForwardPath}`);

    expect(backwards).toContain("did not move forward");
    expect(elsewhere.status).toBe(NOT_FOUND);
  }).pipe(Effect.provide(commandLineServices)),
);
