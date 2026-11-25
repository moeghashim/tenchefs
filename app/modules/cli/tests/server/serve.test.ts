import { Array as Arr, Effect, FileSystem, Layer, Path, Schema, String as Str } from "effect";
import {
  answer,
  commandLineServices,
  freshDatabasePath,
  refusal,
  runCookout,
  runServe,
  silentConnection,
  startServe,
} from "../../../testing/server.ts";
import { createTestAgent, testClient } from "../../../testing/index.ts";
import { expect, it } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";
import { secretsLive } from "../../../secrets/server.ts";
import { storageLayer } from "../../../storage/server.ts";

interface StoredFiles {
  readonly files: readonly string[];
  readonly text: string;
}

const ISSUED = 3;
const UNAUTHORIZED = 401;
const NEW_ADMIN_TOKEN = "new-admin-token-0123456789abcdef0123456789";
const SHORT_ADMIN_TOKEN = "hunter2-but-longer";
const EXIT_FAILURE = 1;
const POSTGRES_URL = "postgres://cookout:hunter2-the-password@db.example:5432/board";
const mentionsAToken = Schema.is(Schema.Struct({ adminToken: Schema.Unknown }));

function filesNextTo(database: string): Effect.Effect<StoredFiles, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* readStoredFiles() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = path.dirname(database);
    const entries = yield* fs.readDirectory(folder, { recursive: true });
    const files = yield* Effect.filter(entries, (entry) =>
      Effect.map(fs.stat(path.join(folder, entry)), (info) => info.type === "File"),
    );
    const contents = yield* Effect.forEach(files, (file) => fs.readFileString(path.join(folder, file), "latin1"), {
      concurrency: 1,
    });
    return { files, text: Arr.join(contents, "\n") };
  }).pipe(Effect.orDie);
}

function issueTokens(url: string, adminToken: string): Effect.Effect<readonly string[]> {
  return Effect.gen(function* createAndRotate() {
    const admin = testClient({ env: {}, token: adminToken, url });
    const created = yield* answer(() => createTestAgent({ by: admin, displayName: "agent", name: "agent" }));
    const rotated = yield* answer(() => admin.rotateToken("agent"));
    return [adminToken, created.token, rotated.token];
  });
}

it.effect("a fresh board's admin works with COOKOUT_ADMIN_TOKEN, and serve prints nothing about it", () =>
  Effect.gen(function* adminTokenFromSetting() {
    const database = yield* freshDatabasePath;
    const server = yield* startServe({ database });
    const whoami = yield* answer(testClient({ env: {}, token: server.adminToken, url: server.url }).whoami);

    expect(whoami.identity).toMatchObject({ admin: true, name: "admin" });
    expect(server.stdout).not.toContain(server.adminToken);
    expect(Arr.filter(server.lines, mentionsAToken)).toStrictEqual([]);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("restarting a board with a different COOKOUT_ADMIN_TOKEN makes the new one work and the old one fail", () =>
  Effect.gen(function* restartWithNewAdminToken() {
    const database = yield* freshDatabasePath;
    const first = yield* startServe({ database });
    yield* first.stop;
    const second = yield* startServe({ adminToken: NEW_ADMIN_TOKEN, database });
    const whoami = yield* answer(testClient({ env: {}, token: NEW_ADMIN_TOKEN, url: second.url }).whoami);
    const old = yield* refusal(testClient({ env: {}, token: first.adminToken, url: second.url }).whoami);

    expect(whoami.identity).toMatchObject({ admin: true, name: "admin" });
    expect(old).toMatchObject({ status: UNAUTHORIZED });
    expect(second.stdout).not.toContain(NEW_ADMIN_TOKEN);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("a stopping board drops a connection that never sent a request instead of waiting for it", () =>
  Effect.gen(function* stopWithASilentConnection() {
    const database = yield* freshDatabasePath;
    const server = yield* startServe({ database });
    const silent = yield* silentConnection(server.url);
    const whoami = yield* answer(testClient({ env: {}, token: server.adminToken, url: server.url }).whoami);
    yield* server.stop;
    yield* silent.dropped;

    expect(whoami.identity).toMatchObject({ name: "admin" });
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("the database never holds a token itself", () =>
  Effect.gen(function* noTokensOnDisk() {
    const database = yield* freshDatabasePath;
    const server = yield* startServe({ database });
    const tokens = yield* issueTokens(server.url, server.adminToken);
    yield* server.stop;
    const { files, text } = yield* filesNextTo(database);
    const onDisk = Arr.filter(tokens, (token) => Str.includes(token)(text));

    expect(files).toContain("cookout.db");
    expect(tokens).toHaveLength(ISSUED);
    expect(onDisk).toStrictEqual([]);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve refuses to start without COOKOUT_ADMIN_TOKEN and says how to set it", () =>
  Effect.gen(function* refusesWithoutAdminToken() {
    const refused = yield* runCookout({ args: ["serve", "--port", "0", "--host", "127.0.0.1"], env: {} });

    expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
    expect(refused.stderr).toContain("COOKOUT_ADMIN_TOKEN must be set");
    expect(refused.stderr).toContain("openssl rand -hex 32");
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("cookout serve refuses a COOKOUT_ADMIN_TOKEN too short to be a token without showing it", () =>
  Effect.gen(function* refusesShortAdminToken() {
    const refused = yield* runCookout({
      args: ["serve", "--port", "0", "--host", "127.0.0.1"],
      env: { COOKOUT_ADMIN_TOKEN: SHORT_ADMIN_TOKEN },
    });

    expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
    expect(refused.stderr).toContain("at least 32 characters");
    expect(refused.stderr).not.toContain(SHORT_ADMIN_TOKEN);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("cookout serve gives the admin token to COOKOUT_ADMIN_NAME, and to admin when it is empty", () =>
  Effect.gen(function* adminNameFromSetting() {
    const named = yield* startServe({ database: yield* freshDatabasePath, env: { COOKOUT_ADMIN_NAME: "matt" } });
    const empty = yield* startServe({ database: yield* freshDatabasePath, env: { COOKOUT_ADMIN_NAME: "" } });
    const matt = yield* answer(testClient({ env: {}, token: named.adminToken, url: named.url }).whoami);
    const admin = yield* answer(testClient({ env: {}, token: empty.adminToken, url: empty.url }).whoami);

    expect(matt.identity).toMatchObject({ admin: true, kind: "human", name: "matt" });
    expect(admin.identity).toMatchObject({ admin: true, kind: "human", name: "admin" });
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve refuses a COOKOUT_ADMIN_NAME that breaks the identity-name rule", () =>
  Effect.gen(function* refusesBadAdminName() {
    const database = yield* freshDatabasePath;
    const refused = yield* runServe({ database, env: { COOKOUT_ADMIN_NAME: "Not_A_Name" } });

    expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
    expect(refused.stderrJson).toMatchObject({ error: { code: "admin_name_invalid" } });
    expect(refused.stderr).toContain("COOKOUT_ADMIN_NAME must be an identity name");
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve prints why the database didn't open or migrate on stderr, and exits 1", () =>
  Effect.gen(function* printsStorageFailure() {
    const fs = yield* FileSystem.FileSystem;
    const database = yield* freshDatabasePath;
    yield* fs.writeFileString(database, "this is not a SQLite database, and no migration can run on it\n");
    const refused = yield* runServe({ database });

    expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
    expect(refused.stderrJson).toStrictEqual({
      error: { code: "storage_unavailable", message: "file is not a database" },
    });
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve on a port already in use prints why it failed to start on stderr, and exits 1", () =>
  Effect.gen(function* printsPortInUse() {
    const first = yield* startServe({ database: yield* freshDatabasePath });
    const taken = Number(new URL(first.url).port);
    const failed = yield* runServe({ database: yield* freshDatabasePath, port: taken });

    expect(failed).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
    expect(failed.stderr).toMatch(/^cookout serve failed to start: ServeError: .*EADDRINUSE/v);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve with a bad setting prints which one on stderr without its value, and exits 1", () =>
  Effect.gen(function* printsBadSetting() {
    const database = yield* freshDatabasePath;
    const failed = yield* runServe({ database, env: { COOKOUT_WEBHOOK_TIMEOUT_SECONDS: "soon-ish" } });

    expect(failed).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
    expect(failed.stderr).toMatch(/^cookout serve failed to start: ConfigError: .*COOKOUT_WEBHOOK_TIMEOUT_SECONDS/v);
    expect(failed.stderr).not.toContain("soon-ish");
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect(
  "cookout serve that crashes while starting prints the defect's message and first stack frame, and exits 1",
  () =>
    Effect.gen(function* printsDefect() {
      const database = yield* freshDatabasePath;
      const crash = Layer.effectDiscard(Effect.die(new Error("the disk caught fire")));
      const failed = yield* runServe({ database, storage: (setting) => Layer.provide(storageLayer(setting), crash) });

      expect(failed).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
      expect(failed.stderr).toMatch(
        /^cookout serve failed to start: Error: the disk caught fire \(at .*serve\.test\.ts/v,
      );
      expect(failed.stderr).not.toContain("\n");
    }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve that crashes while starting with something other than an Error prints it as a defect", () =>
  Effect.gen(function* printsBareDefect() {
    const database = yield* freshDatabasePath;
    const crash = Layer.effectDiscard(Effect.die("the disk caught fire"));
    const failed = yield* runServe({ database, storage: (setting) => Layer.provide(storageLayer(setting), crash) });

    expect(failed).toMatchObject({
      exitCode: EXIT_FAILURE,
      stderr: "cookout serve failed to start: Defect: the disk caught fire",
    });
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve refuses a COOKOUT_ADMIN_NAME that names an agent, naming the clash", () =>
  Effect.gen(function* refusesAgentAdminName() {
    const database = yield* freshDatabasePath;
    const first = yield* startServe({ database });
    const admin = testClient({ env: {}, token: first.adminToken, url: first.url });
    yield* answer(() => createTestAgent({ by: admin, displayName: "release-bot", name: "release-bot" }));
    yield* first.stop;
    const refused = yield* runServe({ database, env: { COOKOUT_ADMIN_NAME: "release-bot" } });

    expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
    expect(refused.stderrJson).toMatchObject({ error: { code: "admin_name_agent" } });
    expect(refused.stderr).toContain("release-bot, an agent");
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve without DATABASE_URL opens the SQLite file at COOKOUT_DB, as before, and names it", () =>
  Effect.gen(function* serveSqliteFromSetting() {
    const fs = yield* FileSystem.FileSystem;
    const database = yield* freshDatabasePath;
    const server = yield* startServe({ env: { COOKOUT_DB: database } });
    const whoami = yield* answer(testClient({ env: {}, token: server.adminToken, url: server.url }).whoami);
    const made = yield* fs.exists(database);

    expect(whoami.identity).toMatchObject({ name: "admin" });
    expect(server.lines).toContainEqual({ database, listening: server.url });
    expect(made).toBe(true);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve whose start fails quoting DATABASE_URL prints only its host and database", () =>
  Effect.gen(function* redactsQuotedUrl() {
    const crash = Layer.effectDiscard(Effect.die(new Error(`could not reach ${POSTGRES_URL}`)));
    const failed = yield* runServe({
      env: { DATABASE_URL: POSTGRES_URL },
      storage: (setting) => Layer.provide(storageLayer(setting), crash),
    });

    expect(failed).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
    expect(failed.stderr).toMatch(
      /^cookout serve failed to start: Error: could not reach postgres:\/\/db\.example:5432\/board /v,
    );
    expect(failed.stderr).not.toContain("hunter2-the-password");
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve refuses a DATABASE_URL that isn't a Postgres URL without showing it", () =>
  Effect.gen(function* refusesBadDatabaseUrl() {
    const failed = yield* runServe({ env: { DATABASE_URL: "mysql://cookout:hunter2-the-password@db.example/board" } });

    expect(failed).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
    expect(failed.stderr).toMatch(/^cookout serve failed to start: ConfigError: .*DATABASE_URL/v);
    expect(failed.stderr).not.toContain("hunter2-the-password");
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);
