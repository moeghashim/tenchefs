import { Array as Arr, Effect, FileSystem, Path } from "effect";
import { expect, it } from "@effect/vitest";
import { freshDatabasePath, messageId, openStore, testSecretsCipher } from "../../../testing/server.ts";
import { NodeServices } from "@effect/platform-node";
import type { SearchQuery } from "../../server.ts";
import { parseQuery } from "../../../search/index.ts";
import { sqliteStorage } from "../../server.ts";

const BEFORE_SEARCH = new URL("fixtures/before-search.db", import.meta.url);
const EVERY = { limit: 50 } as const;
const FIRST_MESSAGE = 1;
const SECOND_MESSAGE = 2;
const PARENT = messageId(FIRST_MESSAGE);
const REPLY = messageId(SECOND_MESSAGE);

function wordsOf(query: string): SearchQuery {
  return { authors: [], channels: [], words: parseQuery(query).words };
}

const copiedDatabase = Effect.gen(function* copyFixture() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const fixture = yield* path.fromFileUrl(BEFORE_SEARCH);
  const copy = yield* freshDatabasePath;
  yield* fs.copyFile(fixture, copy);
  return copy;
}).pipe(Effect.orDie);

it.effect("the search migration indexes every message stored before search existed", () =>
  Effect.gen(function* backfill() {
    const path = yield* copiedDatabase;
    const { storage } = yield* openStore(sqliteStorage({ cipher: testSecretsCipher, path }));

    const freeze = yield* storage.searchMessages(wordsOf("deploy freeze"), EVERY);
    const login = yield* storage.searchMessages(wordsOf("login"), EVERY);

    expect(Arr.map(freeze.results, ({ message }) => message.id)).toStrictEqual([PARENT]);
    expect(login.results).toMatchObject([{ message: { id: REPLY, kind: "reply" }, threadClosed: false }]);
  }).pipe(Effect.provide(NodeServices.layer)),
);
