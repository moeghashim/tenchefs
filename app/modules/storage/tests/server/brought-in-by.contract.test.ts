import type { AgentIdentity, Identity } from "../../../identities/index.ts";
import { Array as Arr, Effect, Option, String as Str } from "effect";
import { expect, it } from "@effect/vitest";
import { fixtureTime, identityName as nameOf, openStore, storageLayers } from "../../../testing/server.ts";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));

function agent(name: string): AgentIdentity {
  return { admin: false, createdAt: fixtureTime, kind: "agent", name: nameOf(name), owner: nameOf("matt") };
}

function named(identities: readonly Identity[], name: string): Identity | undefined {
  return Option.getOrUndefined(Arr.findFirst(identities, (found) => found.name === name));
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): an agent keeps the agent that brought it in, until that agent is deleted",
  ({ layer }) =>
    Effect.gen(function* keepBroughtInBy() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(agent("chief"), hashA);
      yield* storage.createIdentity({ ...agent("worker"), broughtInBy: nameOf("chief") }, hashB);
      const found = yield* storage.findIdentityByName(nameOf("worker"));
      const listed = yield* storage.listIdentities();
      const after = yield* Effect.andThen(
        storage.deleteIdentity(nameOf("chief")),
        storage.findIdentityByName(nameOf("worker")),
      );

      expect(found).toMatchObject({ broughtInBy: "chief", name: "worker" });
      expect(named(listed, "worker")).toMatchObject({ broughtInBy: "chief" });
      expect(named(listed, "chief")).not.toHaveProperty("broughtInBy");
      expect(after).toStrictEqual(agent("worker"));
    }),
);
