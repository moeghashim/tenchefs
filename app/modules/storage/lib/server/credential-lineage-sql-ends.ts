import { Array as Arr, Effect, Option, Predicate, Schema } from "effect";
import type { EndedCredential, EndedWhy } from "./credential-lineage.ts";
import { TRUE, isFalse } from "./adapters/sql-database.ts";
import { isIdentityName, tokenHash } from "../../../identities/index.ts";
import type { Fails } from "./errors.ts";
import type { IsoTime } from "../../../time/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { TokenHash } from "../../../identities/index.ts";
import { unreadable } from "./errors.ts";

const ONE_AT_A_TIME = { concurrency: 1 } as const;

interface Ending {
  readonly hash: TokenHash;
  readonly why: EndedWhy;
  readonly now: IsoTime;
}

const MARK_ENDED = "UPDATE credential_lineage SET ended_at = ?, ended_why = ? WHERE hash = ? AND ended_at IS NULL";

function markEndedIn(db: SqlDatabase): (ending: Ending) => Fails<void> {
  return ({ hash, now, why }) => db.run(MARK_ENDED, now, why, hash);
}

function treeOf(roots: string): string {
  return `WITH RECURSIVE tree(hash) AS (
    ${roots}
    UNION
    SELECT l.hash FROM credential_lineage AS l JOIN tree ON l.parent_hash = tree.hash
  ) SELECT hash FROM tree`;
}

const NameColumn = Schema.String.pipe(Schema.refine(isIdentityName));
const HashRow = Schema.Struct({ hash: Schema.String });
const HolderRow = Schema.Struct({ expires_at: IsoTimeSchema, identity_name: NameColumn });

function decodedWith<RowSchema extends Schema.Decoder<unknown>>(schema: RowSchema) {
  return (row: unknown): Fails<Option.Option<RowSchema["Type"]>> => {
    if (!Predicate.isObject(row)) {
      return Effect.succeedNone;
    }
    return Effect.mapBoth(Schema.decodeEffect(schema)(row), { onFailure: unreadable, onSuccess: Option.some });
  };
}

const holderRow = decodedWith(HolderRow);

function hashesIn(db: SqlDatabase, roots: string, ...params: readonly string[]): Fails<readonly TokenHash[]> {
  return Effect.flatMap(db.all(treeOf(roots), ...params), (rows) =>
    Effect.mapBoth(
      Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(HashRow)(row), ONE_AT_A_TIME),
      { onFailure: unreadable, onSuccess: Arr.map(({ hash }) => tokenHash(hash)) },
    ),
  );
}

interface KindTable {
  readonly kind: EndedCredential["kind"];
  readonly find: string;
  readonly end: string;
}

function kindTables(db: SqlDatabase): readonly KindTable[] {
  return [
    {
      end: "DELETE FROM login_credentials WHERE hash = ?",
      find: "SELECT identity_name, expires_at FROM login_credentials WHERE hash = ?",
      kind: "session",
    },
    {
      end: `UPDATE agent_session_tokens SET revoked = ${TRUE[db.dialect]} WHERE hash = ?`,
      find: `SELECT identity_name, expires_at FROM agent_session_tokens WHERE hash = ? AND ${isFalse[db.dialect]("revoked")}`,
      kind: "agent session",
    },
    {
      end: "DELETE FROM join_codes WHERE code_hash = ?",
      find: "SELECT agent AS identity_name, expires_at FROM join_codes WHERE code_hash = ?",
      kind: "join code",
    },
    {
      end: "DELETE FROM login_links WHERE link_hash = ?",
      find: "SELECT identity_name, expires_at FROM login_links WHERE link_hash = ?",
      kind: "login link",
    },
  ];
}

interface Looking {
  readonly db: SqlDatabase;
  readonly hash: TokenHash;
  readonly now: IsoTime;
}

function liveIn({ db, hash, now }: Looking): Fails<readonly EndedCredential[]> {
  return Effect.map(
    Effect.forEach(
      kindTables(db),
      (table) =>
        Effect.map(
          Effect.flatMap(db.get(table.find, hash), holderRow),
          (found): Option.Option<EndedCredential> =>
            Option.map(
              Option.filter(found, ({ expires_at }) => now < expires_at),
              ({ identity_name }) => ({ hash, identity: identity_name, kind: table.kind }),
            ),
        ),
      ONE_AT_A_TIME,
    ),
    Arr.getSomes,
  );
}

interface Among {
  readonly db: SqlDatabase;
  readonly hashes: readonly TokenHash[];
  readonly now: IsoTime;
}

function liveAmong({ db, hashes, now }: Among): Fails<readonly EndedCredential[]> {
  return Effect.map(
    Effect.forEach(hashes, (hash) => liveIn({ db, hash, now }), ONE_AT_A_TIME),
    Arr.flatten,
  );
}

function endEach({ db, hashes, now }: Among): Fails<readonly EndedCredential[]> {
  return Effect.map(
    Effect.forEach(
      hashes,
      (hash) =>
        Effect.gen(function* endOne() {
          const ended = yield* liveIn({ db, hash, now });
          yield* Effect.forEach(kindTables(db), (table) => db.run(table.end, hash), ONE_AT_A_TIME);
          yield* markEndedIn(db)({ hash, now, why: "revoked" });
          return ended;
        }),
      ONE_AT_A_TIME,
    ),
    Arr.flatten,
  );
}

export { type Ending, HashRow, NameColumn, ONE_AT_A_TIME, decodedWith, endEach, hashesIn, liveAmong, markEndedIn };
