import { Array as Arr, Effect, Option } from "effect";
import type { CookoutClient, Identity } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { TestCookoutService } from "../../../testing/server.ts";
import { createCookoutClient } from "../../index.ts";

const FORBIDDEN = 403;
const CONFLICT = 409;
const ONE_AT_A_TIME = { concurrency: 1 } as const;

function fromClaudeCode(cookout: TestCookoutService, token: string): CookoutClient {
  return createCookoutClient({ env: {}, harness: "claude-code", token, url: cookout.url });
}

function humanFromClaudeCode(cookout: TestCookoutService, name: string): Effect.Effect<CookoutClient> {
  return Effect.map(cookout.createIdentity(name, { kind: "human" }), ({ token }) => fromClaudeCode(cookout, token));
}

function ownerName(identity: Identity): string {
  if (identity.kind === "human") {
    return "none";
  }
  return identity.owner;
}

function ownerOf(cookout: TestCookoutService, name: string): Effect.Effect<string> {
  return Effect.map(
    answer(() => cookout.client.listIdentities()),
    ({ identities }) =>
      Arr.findFirst(identities, (identity) => identity.name === name).pipe(
        Option.map(ownerName),
        Option.getOrElse(() => "none"),
      ),
  );
}

it.effect("a human joins an agent they own by its name, and the session acts as that agent", () =>
  Effect.gen(function* joinOwned() {
    const cookout = yield* TestCookout;
    const grace = yield* humanFromClaudeCode(cookout, "grace");
    yield* cookout.createIdentity("triage-agent", { owner: "grace" });
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    const joined = yield* answer(() => grace.join({ as: "triage-agent" }));
    const session = cookout.clientFor(joined.agentSessionToken);
    const { message } = yield* answer(() => session.createMessage({ channel: "grill", text: "triaged" }));

    expect(joined).toMatchObject({ created: false, identity: "triage-agent" });
    expect(message.author.name).toBe("triage-agent");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a name someone else owns makes <caller>/<name>, created once and joined again after", () =>
  Effect.gen(function* joinNamespaced() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("triage-agent", { owner: "grace" });
    const ada = yield* humanFromClaudeCode(cookout, "ada");
    const first = yield* answer(() => ada.join({ as: "triage-agent", displayName: "Triage" }));
    yield* answer(() => cookout.clientFor(first.agentSessionToken).leave());
    const second = yield* answer(() => ada.join({ as: "triage-agent" }));
    const owners = yield* Effect.all(
      [ownerOf(cookout, "triage-agent"), ownerOf(cookout, "ada/triage-agent")],
      ONE_AT_A_TIME,
    );

    expect(first).toMatchObject({ created: true, identity: "ada/triage-agent" });
    expect(second).toMatchObject({ created: false, identity: "ada/triage-agent" });
    expect(owners).toStrictEqual(["grace", "ada"]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a free name is created as an agent the caller owns", () =>
  Effect.gen(function* joinFree() {
    const cookout = yield* TestCookout;
    const ada = yield* humanFromClaudeCode(cookout, "ada");
    const joined = yield* answer(() => ada.join({ as: "scout", displayName: "Scout" }));
    const ownNamespace = yield* answer(() => ada.join({ as: "ada/helper", displayName: "Helper" }));
    const owner = yield* ownerOf(cookout, "scout");

    expect(joined).toMatchObject({ created: true, identity: "scout" });
    expect(ownNamespace).toMatchObject({ created: true, identity: "ada/helper" });
    expect(owner).toBe("ada");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a human's name and another human's namespace are refused", () =>
  Effect.gen(function* joinRefused() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("grace", { kind: "human" });
    const ada = yield* humanFromClaudeCode(cookout, "ada");
    yield* cookout.createIdentity("grace/y", { owner: "grace" });
    const errors = yield* Effect.all(
      [
        refusal(() => ada.join({ as: "grace" })),
        refusal(() => ada.join({ as: "ada" })),
        refusal(() => ada.join({ as: "grace/x", displayName: "X" })),
        refusal(() => ada.join({ as: "grace/y" })),
      ],
      ONE_AT_A_TIME,
    );

    expect(errors).toMatchObject([
      { code: "identity_kind", status: FORBIDDEN },
      { code: "identity_kind", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a deactivated agent the caller owns is refused until reactivated", () =>
  Effect.gen(function* joinDeactivated() {
    const cookout = yield* TestCookout;
    const ada = yield* humanFromClaudeCode(cookout, "ada");
    yield* cookout.createIdentity("scout", { owner: "ada" });
    yield* answer(() => cookout.client.deactivateIdentity("scout"));
    const error = yield* refusal(() => ada.join({ as: "scout" }));

    expect(error).toMatchObject({ code: "identity_deactivated", status: CONFLICT });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a human's token from a harness is accepted by the join route only", () =>
  Effect.gen(function* guardExemption() {
    const cookout = yield* TestCookout;
    const grace = yield* humanFromClaudeCode(cookout, "grace");
    const joined = yield* answer(() => grace.join({ as: "scout", displayName: "Scout" }));
    const refused = yield* Effect.all(
      [refusal(() => grace.whoami()), refusal(() => grace.createMessage({ channel: "grill", text: "as grace" }))],
      ONE_AT_A_TIME,
    );

    expect(joined).toMatchObject({ identity: "scout" });
    expect(refused).toMatchObject([
      { code: "agent_as_human", status: FORBIDDEN },
      { code: "agent_as_human", status: FORBIDDEN },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent's own token joins only itself, answering with its name", () =>
  Effect.gen(function* agentJoinsItself() {
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity("release-bot", { owner: "grace" });
    const client = fromClaudeCode(cookout, agent.token);
    const joined = yield* answer(() => client.join({ as: "release-bot" }));
    const other = yield* refusal(() => client.join({ as: "scout" }));

    expect(joined).toMatchObject({ created: false, identity: "release-bot" });
    expect(other).toMatchObject({ code: "not_your_identity", status: FORBIDDEN });
  }).pipe(Effect.provide(testCookout())),
);
