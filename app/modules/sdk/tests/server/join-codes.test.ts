import { Duration, Effect } from "effect";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { TestClock } from "effect/testing";

const CREATED_AT = "2026-01-01T00:00:00.000Z";
const NOT_FOUND = 404;
const FORBIDDEN = 403;
const CONFLICT = 409;
const BAD_REQUEST = 400;
const LIFETIME_MINUTES = 15;
const notFound = { code: "join_code_not_found", status: NOT_FOUND };

it.effect("a human creates an agent they own, described, with a join code shown once", () =>
  Effect.gen(function* create() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const created = yield* answer(() =>
      ada.client.createJoinCode({
        description: "  Triage the bug queue.  ",
        displayName: "triage-agent",
        name: "triage-agent",
      }),
    );

    expect(created).toStrictEqual({
      expiresAt: "2026-01-01T00:15:00.000Z",
      identity: {
        admin: false,
        createdAt: CREATED_AT,
        description: "Triage the bug queue.",
        displayName: "triage-agent",
        kind: "agent",
        name: "triage-agent",
        owner: "ada",
      },
      joinCode: created.joinCode,
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a join code joins its agent once, with no token, and never as a person", () =>
  Effect.gen(function* redeemOnce() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const created = yield* answer(() =>
      ada.client.createJoinCode({ displayName: "triage-agent", name: "triage-agent" }),
    );
    const session = yield* answer(() =>
      cookout.clientFor().redeemJoinCode({ host: "cloud-box", idleExpiry: "1d", joinCode: created.joinCode }),
    );
    const again = yield* refusal(() => cookout.clientFor().redeemJoinCode({ joinCode: created.joinCode }));
    const actingAs = yield* answer(() => cookout.clientFor(session.agentSessionToken).whoami());
    const listed = yield* answer(() => ada.client.listAgentSessions("triage-agent"));

    expect(session).toStrictEqual({
      agentSessionToken: session.agentSessionToken,
      created: false,
      expiresAt: "2026-01-02T00:00:00.000Z",
      identity: "triage-agent",
      issuedAt: CREATED_AT,
    });
    expect(session.agentSessionToken).not.toBe(created.joinCode);
    expect([again, actingAs.identity, listed.agentSessions]).toMatchObject([
      notFound,
      { kind: "agent", name: "triage-agent", owner: "ada" },
      [{ host: "cloud-box" }],
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a join code expires 15 minutes after it was made, and an unknown one is refused alike", () =>
  Effect.gen(function* expiry() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const created = yield* answer(() => ada.client.createJoinCode({ displayName: "late-agent", name: "late-agent" }));
    const unknown = yield* refusal(() => cookout.clientFor().redeemJoinCode({ joinCode: "cookout_never-issued" }));
    yield* TestClock.adjust(Duration.minutes(LIFETIME_MINUTES));
    const expired = yield* refusal(() => cookout.clientFor().redeemJoinCode({ joinCode: created.joinCode }));

    expect(unknown).toMatchObject(notFound);
    expect(expired).toMatchObject(notFound);
    expect(expired.message).toContain("used, expired, or never issued");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a join code is refused for a deactivated agent, and kept for when it is reactivated", () =>
  Effect.gen(function* deactivated() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const created = yield* answer(() =>
      ada.client.createJoinCode({ displayName: "paused-agent", name: "paused-agent" }),
    );
    yield* answer(() => ada.client.deactivateIdentity("paused-agent"));
    const whileDeactivated = yield* refusal(() => cookout.clientFor().redeemJoinCode({ joinCode: created.joinCode }));
    yield* answer(() => ada.client.reactivateIdentity("paused-agent"));
    const session = yield* answer(() => cookout.clientFor().redeemJoinCode({ joinCode: created.joinCode }));

    expect(whileDeactivated).toMatchObject({ code: "identity_deactivated", status: CONFLICT });
    expect(session).toMatchObject({ identity: "paused-agent" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a join code is refused while its agent has a live agent session token", () =>
  Effect.gen(function* liveSession() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const created = yield* answer(() => ada.client.createJoinCode({ displayName: "busy-agent", name: "busy-agent" }));
    yield* answer(() => ada.client.join({ as: "busy-agent" }));
    const whileLive = yield* refusal(() => cookout.clientFor().redeemJoinCode({ joinCode: created.joinCode }));

    expect(whileLive).toMatchObject({ code: "agent_session_live", status: CONFLICT });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("only a human makes a join code, for a free name in their own namespace", () =>
  Effect.gen(function* refusals() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const bot = yield* cookout.createIdentity("bot", { owner: "ada" });
    yield* cookout.createIdentity("grace", { kind: "human" });
    const byAgent = yield* refusal(() => bot.client.createJoinCode({ displayName: "helper", name: "helper" }));
    const taken = yield* refusal(() => ada.client.createJoinCode({ displayName: "bot", name: "bot" }));
    const othersNamespace = yield* refusal(() =>
      ada.client.createJoinCode({ displayName: "grace/helper", name: "grace/helper" }),
    );
    const tooLong = yield* refusal(() =>
      cookout.clientFor().redeemJoinCode({ idleExpiry: "9999d", joinCode: "cookout_never-issued" }),
    );

    expect([byAgent, taken, othersNamespace, tooLong]).toMatchObject([
      { code: "human_only", status: FORBIDDEN },
      { code: "identity_exists", status: CONFLICT },
      { code: "name_not_owned", status: BAD_REQUEST },
      { code: "idle_expiry_too_long", status: BAD_REQUEST },
    ]);
  }).pipe(Effect.provide(testCookout())),
);
