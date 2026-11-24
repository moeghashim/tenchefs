import { Effect, FileSystem, Redacted } from "effect";
import { answer, emptyPostgresDatabase, freshDatabasePath, runServe, startServe } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";
import type { ServeProcess } from "../../../testing/server.ts";
import { createCookoutClient } from "../../../sdk/index.ts";
import { secretsLive } from "../../../secrets/server.ts";

const EXIT_FAILURE = 1;
const NOTHING_LISTENS = "1";
const WRONG_PASSWORD = "not-the-password";

const postgresUrl = Effect.map(emptyPostgresDatabase, (database) => new URL(Redacted.value(database)));

function shown({ host, pathname }: { readonly host: string; readonly pathname: string }): string {
  return `postgres://${host}${pathname}`;
}

const postAndRead = Effect.fnUntraced(function* postThenRead({
  adminToken,
  url,
}: Pick<ServeProcess, "adminToken" | "url">) {
  const admin = createCookoutClient({ env: {}, token: adminToken, url });
  yield* answer(() => admin.createChannel({ name: "grill" }));
  const posted = yield* answer(() => admin.createMessage({ channel: "grill", text: "lunch is on the grill" }));
  const thread = yield* answer(() => admin.getThread(posted.message.id));
  return { posted, thread };
});

it.effect(
  "cookout serve with DATABASE_URL serves a post and a read from Postgres, naming its host and database but not its password",
  () =>
    Effect.gen(function* servePostgres() {
      const url = yield* postgresUrl;
      const sqlite = yield* freshDatabasePath;
      const server = yield* startServe({ env: { COOKOUT_DB: sqlite, DATABASE_URL: url.toString() } });
      const { posted, thread } = yield* postAndRead(server);
      const fs = yield* FileSystem.FileSystem;
      const sqliteMade = yield* fs.exists(sqlite);

      expect(thread).toMatchObject({ parent: { id: posted.message.id, text: "lunch is on the grill" } });
      expect(server.lines).toContainEqual({ database: shown(url), listening: server.url });
      expect(server.stdout).not.toContain(url.password);
      expect(sqliteMade).toBe(false);
    }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve on a DATABASE_URL that refuses its password fails with one stderr line without it", () =>
  Effect.gen(function* refusedPassword() {
    const url = yield* postgresUrl;
    url.password = WRONG_PASSWORD;
    const failed = yield* runServe({ env: { DATABASE_URL: url.toString() } });

    expect(failed).toMatchObject({
      exitCode: EXIT_FAILURE,
      stderrJson: { error: { code: "storage_unavailable" } },
      stdout: "",
    });
    expect(failed.stderr).not.toContain("\n");
    expect(failed.stderr).not.toContain(WRONG_PASSWORD);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve on a DATABASE_URL nothing answers fails with one stderr line without its password", () =>
  Effect.gen(function* unreachable() {
    const url = yield* postgresUrl;
    url.port = NOTHING_LISTENS;
    const failed = yield* runServe({ env: { DATABASE_URL: url.toString() } });

    expect(failed).toMatchObject({
      exitCode: EXIT_FAILURE,
      stderrJson: { error: { code: "storage_unavailable" } },
      stdout: "",
    });
    expect(failed.stderr).not.toContain("\n");
    expect(failed.stderr).not.toContain(url.password);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);
