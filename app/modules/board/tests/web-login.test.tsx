import type { CookoutClient, CookoutErrorCode, Identity } from "../../sdk/index.ts";
import { CookoutError, createCookoutClient } from "../../sdk/index.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Session } from "../index.ts";
import { createBoardStore } from "../index.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const URL = "http://127.0.0.1:1";
const POLL = 2000;
const NOW = 0;
const TWO_POLLS = 4000;
const FOUR_POLLS = 8000;
const NO_CALLS = 0;

type Collect = CookoutClient["collectWebLogin"];
type Start = CookoutClient["startWebLogin"];
type Started = Awaited<ReturnType<Start>>;
type Step = Readonly<Error> | "pending" | "approved";

interface Made {
  readonly ada: Identity;
  readonly started: Started;
}

async function madeThenFaked(name: string): Promise<Made> {
  const { adminToken, url } = webTestCookout();
  const { identity } = await createCookoutClient({ env: {}, token: adminToken, url }).createIdentity({
    kind: "human",
    name,
  });
  const started = await createCookoutClient({ env: {}, url }).startWebLogin();
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  return { ada: identity, started };
}

function refused(code: CookoutErrorCode): CookoutError {
  return new CookoutError({ code, message: `Refused with ${code}.`, status: 400 });
}

function clientWith(start: Start, collect: Collect): CookoutClient {
  return { ...createCookoutClient({ env: {}, url: URL }), collectWebLogin: collect, startWebLogin: start };
}

function sessionWith(start: Start, collect: Collect): Session {
  const { session } = createBoardStore({ client: clientWith(start, collect), live: null, url: URL });
  onTestFinished(session.webLogin.subscribe(vi.fn<() => void>()));
  return session;
}

function startedWith(started: Started): Start {
  return async () => {
    await Promise.resolve();
    return started;
  };
}

function answers(ada: Readonly<Identity>, steps: readonly Step[]): Collect {
  const queue = [...steps];
  return async () => {
    await Promise.resolve();
    const step = queue.shift() ?? "pending";
    if (step instanceof Error) {
      throw step;
    }
    if (step === "approved") {
      return { identity: ada, status: "approved" };
    }
    return { status: "pending" };
  };
}

it("a web login shows its code and where to type it, passes over a rate limit and an unreachable server, and logs in when approved", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { ada, started } = await madeThenFaked("web-login-store-approved");
  const steps = ["pending", refused("rate_limited"), new TypeError("fetch failed"), "approved"] as const;
  const session = sessionWith(startedWith(started), answers(ada, steps));
  session.webLogin.start();
  await vi.advanceTimersByTimeAsync(NOW);
  const waiting = session.webLogin.snapshot();
  await vi.advanceTimersByTimeAsync(FOUR_POLLS);

  expect(waiting).toStrictEqual({
    approvalUrl: `${URL}/#/approve`,
    expiresAt: started.expiresAt,
    status: "waiting",
    userCode: started.userCode,
  });
  expect([session.webLogin.snapshot(), session.snapshot()]).toStrictEqual([
    { status: "choosing" },
    { identity: ada, status: "logged-in" },
  ]);
});

it("a web login whose request is gone has expired, and one refused otherwise shows the refusal", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { ada, started } = await madeThenFaked("web-login-store-expired");
  const expiring = sessionWith(startedWith(started), answers(ada, [refused("login_request_not_found")]));
  const failing = sessionWith(startedWith(started), answers(ada, [refused("internal_error")]));
  expiring.webLogin.start();
  failing.webLogin.start();
  await vi.advanceTimersByTimeAsync(POLL);

  expect([expiring.webLogin.snapshot(), failing.webLogin.snapshot()]).toStrictEqual([
    { status: "expired" },
    { refusal: { code: "internal_error", message: "Refused with internal_error." }, status: "refused" },
  ]);
});

it("a web login that can't start shows the refusal", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { ada } = await madeThenFaked("web-login-store-unstarted");
  const session = sessionWith(
    async () => {
      await Promise.resolve();
      throw refused("rate_limited");
    },
    answers(ada, []),
  );
  session.webLogin.start();
  await vi.advanceTimersByTimeAsync(NOW);

  expect(session.webLogin.snapshot()).toStrictEqual({
    refusal: { code: "rate_limited", message: "Refused with rate_limited." },
    status: "refused",
  });
});

interface HeldStep<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
}

function heldCollect(ada: Identity, held: Readonly<HeldStep<Step>>): Collect {
  return async (requestId) => {
    const step = await held.promise;
    const answered = await answers(ada, [step])(requestId);
    return answered;
  };
}

function heldStart(held: Readonly<HeldStep<Started>>): Start {
  return async () => {
    const started = await held.promise;
    return started;
  };
}

async function startedThenBack(sessions: readonly Session[]): Promise<void> {
  for (const session of sessions) {
    session.webLogin.start();
  }
  await vi.advanceTimersByTimeAsync(POLL);
  for (const session of sessions) {
    session.webLogin.back();
  }
}

async function answeredAfterBack({ ada, started }: Made): Promise<readonly [Session, ...Session[]]> {
  const [approving, refusing] = [Promise.withResolvers<Step>(), Promise.withResolvers<Step>()];
  const late = Promise.withResolvers<Started>();
  const sessions = [
    sessionWith(startedWith(started), heldCollect(ada, approving)),
    sessionWith(startedWith(started), heldCollect(ada, refusing)),
    sessionWith(heldStart(late), answers(ada, [])),
  ] as const;
  await startedThenBack(sessions);
  approving.resolve("approved");
  refusing.resolve(refused("internal_error"));
  late.resolve(started);
  await vi.advanceTimersByTimeAsync(POLL);
  return sessions;
}

function statusesOf(sessions: readonly Session[]): readonly string[] {
  return sessions.map((session) => session.webLogin.snapshot().status);
}

it("going back drops the request: a collect or a start that answers afterwards changes nothing", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const sessions = await answeredAfterBack(await madeThenFaked("web-login-store-back"));
  const [approved] = sessions;

  expect([...statusesOf(sessions), approved.snapshot()]).toStrictEqual([
    "choosing",
    "choosing",
    "choosing",
    { status: "checking" },
  ]);
});

it("the last reader leaving drops the request, so no collect follows", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { ada, started } = await madeThenFaked("web-login-store-left");
  const collect = vi.fn<Collect>(answers(ada, []));
  const { session } = createBoardStore({ client: clientWith(startedWith(started), collect), live: null, url: URL });
  const leave = session.webLogin.subscribe(vi.fn<() => void>());
  session.webLogin.start();
  await vi.advanceTimersByTimeAsync(NOW);
  leave();
  await vi.advanceTimersByTimeAsync(TWO_POLLS);

  expect([session.webLogin.snapshot(), collect.mock.calls.length]).toStrictEqual([{ status: "choosing" }, NO_CALLS]);
});
