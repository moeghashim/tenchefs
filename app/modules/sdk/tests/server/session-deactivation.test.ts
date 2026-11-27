import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { eventsPath, refusalEvent } from "../../../events/index.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";
import type { ServerSentFrame } from "../../../http/client.ts";
import { openEventStream } from "../../../http/client.ts";

const UNAUTHORIZED = 401;

function cliSession(cookout: TestCookoutService, approver: TestIdentity["client"]): Effect.Effect<string> {
  return Effect.gen(function* approvedLogin() {
    const started = yield* answer(() => cookout.clientFor().startLogin({ host: "ada-laptop" }));
    yield* answer(() => approver.approveLogin(started.userCode));
    const collected = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));
    if (collected.status === "approved") {
      return collected.token;
    }
    return expect.unreachable("The login was not approved.");
  });
}

type Frames = AsyncIterator<ServerSentFrame>;

function eventNames(frames: Frames, seen: readonly string[] = []): Effect.Effect<readonly string[]> {
  return Effect.flatMap(
    answer(() => frames.next()),
    (next: Readonly<IteratorResult<ServerSentFrame>>) => {
      if (next.done === true) {
        return Effect.succeed(seen);
      }
      if ("event" in next.value) {
        return eventNames(frames, [...seen, next.value.event]);
      }
      return eventNames(frames, seen);
    },
  );
}

function streamOf(url: string, token: string): Effect.Effect<Frames, never, Scope.Scope> {
  return Effect.gen(function* openAuthorizedStream() {
    const opened = yield* answer(() =>
      openEventStream({ baseUrl: url, headers: { authorization: `Bearer ${token}` }, method: "GET", path: eventsPath }),
    );
    if (!opened.ok) {
      return expect.unreachable(`The stream was refused with ${opened.response.status}.`);
    }
    yield* Effect.addFinalizer(() => answer(() => opened.close()));
    return opened.events[Symbol.asyncIterator]();
  });
}

it.effect(
  "deactivating a person ends their sessions and the agent sessions those sessions joined, closing its stream",
  () =>
    Effect.gen(function* deactivationEnds() {
      const cookout = yield* TestCookout;
      const ada = yield* cookout.createIdentity("ada", { kind: "human" });
      yield* cookout.createIdentity("chief", { owner: "ada" });
      const laptop = yield* cliSession(cookout, ada.client);
      const { agentSessionToken } = yield* answer(() => cookout.clientFor(laptop).join({ as: "chief" }));
      const stream = yield* streamOf(cookout.url, agentSessionToken);
      yield* answer(() => cookout.client.deactivateIdentity("ada"));
      const events = yield* eventNames(stream);
      const refused = yield* Effect.forEach(
        [laptop, agentSessionToken],
        (sent) => refusal(() => cookout.clientFor(sent).whoami()),
        { concurrency: 1 },
      );

      expect({ events, refused }).toMatchObject({
        events: ["connected", refusalEvent],
        refused: [{ status: UNAUTHORIZED }, { status: UNAUTHORIZED }],
      });
    }).pipe(Effect.scoped, Effect.provide(testCookout())),
);
