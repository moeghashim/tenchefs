import { Array as Arr, Effect, String as Str } from "effect";
import { StorageUnavailable, postgresStorage } from "../../server.ts";
import {
  appendTo,
  channelFixture,
  emptyPostgresDatabase,
  identityFixture,
  newMessageFixture,
  onPostgresDatabase,
  openStore,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Redacted } from "effect";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));
const matt = identityFixture("matt", { kind: "human" });
const ada = identityFixture("ada", { kind: "human" });

const BEFORE_INSERT = "CREATE TRIGGER fault BEFORE INSERT ON identities FOR EACH ROW EXECUTE FUNCTION fault()";
const AT_COMMIT = `CREATE CONSTRAINT TRIGGER fault AFTER INSERT ON identities DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fault()`;
const BEFORE_SEARCH = [
  "ALTER TABLE messages DROP COLUMN title, DROP COLUMN title_set_by, DROP COLUMN title_set_at",
  "DROP TABLE avatars_to_remove",
  "DROP TABLE admin_setting",
  "ALTER TABLE messages DROP COLUMN deleted_at, DROP COLUMN deleted_by",
  "ALTER TABLE agent_join_requests DROP COLUMN denied_at",
  "ALTER TABLE login_credentials DROP COLUMN made_with",
  "ALTER TABLE identities DROP COLUMN avatar",
  "ALTER TABLE agent_session_tokens DROP COLUMN session_url",
  "ALTER TABLE agent_join_requests DROP COLUMN session_url",
  "DROP TABLE triggers",
  "ALTER TABLE offline_alerts DROP COLUMN trigger_message, DROP COLUMN trigger_status, DROP COLUMN trigger_error",
  "DROP TABLE scheduled_messages",
  "ALTER TABLE messages DROP COLUMN scheduled_message_id",
  "DROP TABLE attachments",
  "DROP INDEX message_search",
  "DROP FUNCTION message_search_words",
  "UPDATE schema_version SET version = 3",
];
const FAIL_ONCE = "IF nextval('fault_attempts') <= 1 THEN RAISE EXCEPTION 'conflict' USING ERRCODE = '40001'; END IF;";

function failInsertsWith(
  url: Redacted.Redacted,
  failure: string,
  trigger = BEFORE_INSERT,
): Effect.Effect<void, StorageUnavailable> {
  return onPostgresDatabase({
    statements: [
      "CREATE SEQUENCE fault_attempts",
      `CREATE FUNCTION fault() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         ${failure}
         RETURN NEW;
       END $$`,
      trigger,
    ],
    url,
  });
}

function opened(url: Redacted.Redacted): ReturnType<typeof openStore<StorageUnavailable, never>> {
  return url.pipe(postgresStorage, openStore);
}

function openAndClose(url: Redacted.Redacted): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* openThenClose() {
    const store = yield* opened(url);
    yield* store.close;
  });
}

it.effect("identities are kept after the database is migrated, closed and reopened", () =>
  Effect.scoped(
    Effect.gen(function* reopen() {
      const url = yield* emptyPostgresDatabase;
      const first = yield* opened(url);
      yield* first.storage.createIdentity(matt, hashA);
      yield* first.close;
      const second = yield* opened(url);
      const identities = yield* second.storage.listIdentities();
      yield* second.close;

      expect(identities).toStrictEqual([matt]);
    }),
  ),
);

it.effect("a database at a newer schema version than this cookout fails with StorageUnavailable", () =>
  Effect.scoped(
    Effect.gen(function* tooNewSchema() {
      const url = yield* emptyPostgresDatabase;
      yield* openAndClose(url);
      yield* onPostgresDatabase({ statements: ["UPDATE schema_version SET version = 1000"], url });
      const error = yield* Effect.flip(opened(url));

      expect(error).toStrictEqual(
        StorageUnavailable.make({
          message: "The database is at schema version 1000, newer than this cookout (3). Upgrade cookout.",
        }),
      );
    }),
  ),
);

it.effect("two stores opened on the same empty database at once apply each migration once", () =>
  Effect.scoped(
    Effect.gen(function* together() {
      const url = yield* emptyPostgresDatabase;
      const [first, second] = yield* Effect.all([opened(url), opened(url)], {
        concurrency: "unbounded",
      });
      yield* first.storage.createIdentity(matt, hashA);
      const identities = yield* second.storage.listIdentities();
      yield* Effect.andThen(first.close, second.close);

      expect(identities).toStrictEqual([matt]);
    }),
  ),
);

it.live("a transaction that hits a serialization failure is retried and writes once", () =>
  Effect.scoped(
    Effect.gen(function* retried() {
      const url = yield* emptyPostgresDatabase;
      const { close, storage } = yield* opened(url);
      yield* failInsertsWith(url, FAIL_ONCE);
      const created = yield* storage.createIdentity(matt, hashA);
      const identities = yield* storage.listIdentities();
      yield* close;

      expect(created).toBe("created");
      expect(identities).toStrictEqual([matt]);
    }),
  ),
);

it.live("a transaction that keeps hitting serialization failures fails with StorageUnavailable", () =>
  Effect.scoped(
    Effect.gen(function* givesUp() {
      const url = yield* emptyPostgresDatabase;
      const { close, storage } = yield* opened(url);
      yield* failInsertsWith(url, "RAISE EXCEPTION 'conflict' USING ERRCODE = '40001';");
      const error = yield* Effect.flip(storage.createIdentity(matt, hashA));
      const identities = yield* storage.listIdentities();
      yield* close;

      expect(error).toStrictEqual(StorageUnavailable.make({ message: "conflict" }));
      expect(identities).toStrictEqual([]);
    }),
  ),
);

it.effect(
  "a connection killed mid-transaction rolls back, fails with StorageUnavailable, and the next call works",
  () =>
    Effect.scoped(
      Effect.gen(function* killed() {
        const url = yield* emptyPostgresDatabase;
        const { close, storage } = yield* opened(url);
        yield* failInsertsWith(
          url,
          "IF nextval('fault_attempts') <= 1 THEN PERFORM pg_terminate_backend(pg_backend_pid()); END IF;",
        );
        const error = yield* Effect.flip(storage.createIdentity(matt, hashA));
        const afterKill = yield* storage.listIdentities();
        const created = yield* storage.createIdentity(ada, hashB);
        const identities = yield* Effect.tap(storage.listIdentities(), () => close);

        expect(error).toBeInstanceOf(StorageUnavailable);
        expect([afterKill, created, identities]).toStrictEqual([[], "created", [ada]]);
      }),
    ),
);

it.live("a transaction whose commit hits a serialization failure is retried and writes once", () =>
  Effect.scoped(
    Effect.gen(function* retriedCommit() {
      const url = yield* emptyPostgresDatabase;
      const { close, storage } = yield* opened(url);
      yield* failInsertsWith(url, FAIL_ONCE, AT_COMMIT);
      const created = yield* storage.createIdentity(matt, hashA);
      const identities = yield* Effect.tap(storage.listIdentities(), () => close);

      expect([created, identities]).toStrictEqual(["created", [matt]]);
    }),
  ),
);

it.effect("a database with a negative schema version fails with StorageUnavailable", () =>
  Effect.scoped(
    Effect.gen(function* negativeSchema() {
      const url = yield* emptyPostgresDatabase;
      yield* openAndClose(url);
      yield* onPostgresDatabase({ statements: ["UPDATE schema_version SET version = -1"], url });
      const error = yield* Effect.flip(opened(url));

      expect(error).toStrictEqual(StorageUnavailable.make({ message: "The database has no readable schema version." }));
    }),
  ),
);

it.effect("the search migration finds every message stored before search existed", () =>
  Effect.scoped(
    Effect.gen(function* backfill() {
      const url = yield* emptyPostgresDatabase;
      const first = yield* opened(url);
      yield* first.storage.createChannel(channelFixture("grill"));
      const said = yield* appendTo(first.storage)(newMessageFixture("grill", "the deploy freeze is over"));
      yield* first.close;
      yield* onPostgresDatabase({ statements: BEFORE_SEARCH, url });
      const second = yield* opened(url);
      const { results } = yield* second.storage.searchMessages(
        { authors: [], channels: [], words: ["freeze"] },
        { limit: 1 },
      );
      yield* second.close;

      expect(Arr.map(results, ({ message }) => message.id)).toStrictEqual([said.id]);
    }),
  ),
);
