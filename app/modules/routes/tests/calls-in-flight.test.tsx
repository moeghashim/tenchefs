import { createCallsInFlight, holdsCallsOpen, trackedCalls } from "../../testing/web.ts";
import { expect, it, onTestFinished } from "vitest";
import { heldBack } from "./slow-calls.ts";
import { screen } from "@testing-library/react";

const PAST_FIND_BY_MS = 1200;
const STALL_MS = 50;

interface Hanging {
  readonly hang: () => Promise<string>;
}

interface Chained {
  readonly first: () => Promise<string>;
  readonly second: () => Promise<string>;
}

async function forever(): Promise<string> {
  const never = await Promise.withResolvers<string>().promise;
  return never;
}

async function soon(): Promise<string> {
  const answer = await Promise.resolve("answered");
  return answer;
}

async function refusedCall(): Promise<string> {
  await Promise.reject(new Error("refused"));
  return "never";
}

function hanging(): Hanging {
  return { hang: forever };
}

function shown(text: string): void {
  const line = document.createElement("p");
  line.textContent = text;
  document.body.append(line);
  onTestFinished(() => {
    line.remove();
  });
}

async function firstAnswer(): Promise<string> {
  const answer = await Promise.resolve("first");
  return answer;
}

async function secondAnswer(): Promise<string> {
  const answer = await Promise.resolve("second");
  return answer;
}

function chainedClient(): Chained {
  return heldBack({ client: { first: firstAnswer, second: secondAnswer }, delay: PAST_FIND_BY_MS });
}

async function chained(client: Chained): Promise<string> {
  await client.first();
  const second = await client.second();
  shown(second);
  return second;
}

async function answerOnceSettled(waiting: Promise<void>, answer: Promise<string>): Promise<string> {
  await waiting;
  const answered = await answer;
  return answered;
}

it("a read waits for a call in flight and for the call its answer starts, however long they take", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const answers = chained(trackedCalls(chainedClient()));
  const [shownText] = await Promise.all([screen.findByText("second"), answers]);

  expect(shownText.textContent).toBe("second");
});

it("a call that is refused settles too", { timeout: 1000 }, async () => {
  expect.hasAssertions();

  const calls = createCallsInFlight({ stallMs: STALL_MS });
  const refused = calls.track({ refused: refusedCall }).refused();
  const waiting = calls.settled();

  await expect(refused).rejects.toThrow("refused");
  await expect(waiting).resolves.toBeUndefined();
});

it("a call left in flight fails the read, naming the call and the way to hold it open", { timeout: 1000 }, async () => {
  expect.hasAssertions();

  const calls = createCallsInFlight({ stallMs: STALL_MS });
  const hung = calls.track(hanging()).hang();

  await expect(Promise.race([hung, calls.settled()])).rejects.toThrow(
    'calls still in flight after 50 ms before a read of the screen: hang. A test that holds a call open on purpose names it first: holdsCallsOpen("hang") from app/modules/testing/web.ts.',
  );
});

it("holding every call open lets a waiting read go on", { timeout: 1000 }, async () => {
  expect.hasAssertions();

  const calls = createCallsInFlight({ stallMs: STALL_MS });
  const hung = calls.track(hanging()).hang();
  const waiting = calls.settled();
  calls.holdOpen([]);

  await expect(Promise.race([hung, waiting])).resolves.toBeUndefined();
});

it("an answer that isn't a promise, and a value that isn't a call, pass through uncounted", {
  timeout: 1000,
}, async () => {
  expect.hasAssertions();

  const calls = createCallsInFlight({ stallMs: STALL_MS });
  const client = calls.track({ answer: () => "now", url: "https://cookout.test" });

  expect([client.answer(), client.url]).toStrictEqual(["now", "https://cookout.test"]);
  await expect(calls.settled()).resolves.toBeUndefined();
});

it("a call held open by name is left out of the wait, while the others are still waited for", {
  timeout: 1000,
}, async () => {
  expect.hasAssertions();

  const calls = createCallsInFlight({ stallMs: STALL_MS });
  const client = calls.track({ ...hanging(), other: soon });
  const calledBefore = client.hang();
  const other = client.other();
  calls.holdOpen(["hang"]);
  const settledAnswer = answerOnceSettled(calls.settled(), other);

  await expect(Promise.race([calledBefore, client.hang(), settledAnswer])).resolves.toBe("answered");
});

it("a test that holds a call open on purpose reads the screen without waiting for it", {
  timeout: 1000,
}, async () => {
  expect.hasAssertions();

  holdsCallsOpen("hang");
  const hung = trackedCalls(hanging()).hang();
  shown("loading");
  const loading = await Promise.race([hung, screen.findByText("loading")]);

  expect(loading).toBe(screen.getByText("loading"));
});
