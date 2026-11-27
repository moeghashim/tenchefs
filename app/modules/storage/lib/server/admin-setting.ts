import { Effect, Option, Predicate, Ref } from "effect";
import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import { counted, setOnlyTokenOf } from "./identity-row.ts";
import type { Fails } from "./errors.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { TokenLookup } from "./identities.ts";
import { isFalse } from "./adapters/sql-database.ts";

interface AppliedAdminSetting {
  readonly name: IdentityName;
  readonly hash: TokenHash;
}

type AdminSettingResult = "applied" | "unchanged";

type RecordedAdminSetting = "none" | "same" | "other";

interface AdminSettingFacts {
  readonly recorded: RecordedAdminSetting;
  readonly identityExists: boolean;
  readonly tokenKnown: boolean;
}

interface AdminSettingSection {
  readonly applyAdminSetting: (identity: Identity, hash: TokenHash) => Fails<AdminSettingResult>;
}

interface MemoryIdentityOperations {
  readonly findIdentityByName: (name: IdentityName) => Fails<Identity | undefined>;
  readonly findIdentityByTokenHash: (hash: TokenHash) => Fails<TokenLookup>;
  readonly setOnlyToken: (identity: Identity, hash: TokenHash) => Fails<void>;
}

const NONE = 0;

function alreadyApplied({ identityExists, recorded, tokenKnown }: AdminSettingFacts): boolean {
  if (!identityExists) {
    return false;
  }
  if (recorded === "none") {
    return tokenKnown;
  }
  return recorded === "same";
}

function recordedAs(applied: Option.Option<AppliedAdminSetting>, setting: AppliedAdminSetting): RecordedAdminSetting {
  return Option.match(applied, {
    onNone: (): RecordedAdminSetting => "none",
    onSome: ({ hash, name }): RecordedAdminSetting => {
      if (name === setting.name && hash === setting.hash) {
        return "same";
      }
      return "other";
    },
  });
}

function knownTo(name: IdentityName, lookup: TokenLookup): boolean {
  if (lookup.status === "active") {
    return lookup.identity.name === name;
  }
  return lookup.status === "revoked";
}

function memoryAdminSetting(identities: MemoryIdentityOperations): AdminSettingSection {
  const applied = Ref.makeUnsafe(Option.none<AppliedAdminSetting>());
  return {
    applyAdminSetting: (identity, hash) =>
      Effect.gen(function* applyAdminSettingInMemory() {
        const setting = { hash, name: identity.name };
        const found = yield* identities.findIdentityByName(identity.name);
        const lookup = yield* identities.findIdentityByTokenHash(hash);
        const before = yield* Ref.getAndSet(applied, Option.some(setting));
        const recorded = recordedAs(before, setting);
        const facts = {
          identityExists: Predicate.isNotNullish(found),
          recorded,
          tokenKnown: knownTo(identity.name, lookup),
        };
        if (alreadyApplied(facts)) {
          return "unchanged" as const;
        }
        yield* identities.setOnlyToken(identity, hash);
        return "applied" as const;
      }),
  };
}

function present(db: SqlDatabase, sql: string, ...params: readonly string[]): Fails<boolean> {
  return Effect.map(counted(db, sql, ...params), (count) => count > NONE);
}

function recordedIn(db: SqlDatabase, { hash, name }: AppliedAdminSetting): Fails<RecordedAdminSetting> {
  return Effect.zipWith(
    present(db, "SELECT count(*) AS count FROM admin_setting"),
    present(db, "SELECT count(*) AS count FROM admin_setting WHERE identity_name = ? AND token_hash = ?", name, hash),
    (any, same): RecordedAdminSetting => {
      if (same) {
        return "same";
      }
      if (any) {
        return "other";
      }
      return "none";
    },
  );
}

function sqlFacts(db: SqlDatabase, setting: AppliedAdminSetting): Fails<AdminSettingFacts> {
  return Effect.all(
    {
      identityExists: present(db, "SELECT count(*) AS count FROM identities WHERE name = ?", setting.name),
      recorded: recordedIn(db, setting),
      tokenKnown: present(
        db,
        `SELECT count(*) AS count FROM tokens
         WHERE token_hash = ? AND (identity_name = ? OR NOT (${isFalse[db.dialect]("revoked")}))`,
        setting.hash,
        setting.name,
      ),
    },
    { concurrency: 1 },
  );
}

function sqlAdminSetting(db: SqlDatabase): AdminSettingSection {
  return {
    applyAdminSetting: (identity, hash) =>
      db.transaction(
        Effect.gen(function* applyAdminSettingInDatabase() {
          const setting = { hash, name: identity.name };
          const facts = yield* sqlFacts(db, setting);
          yield* db.run(
            `INSERT INTO admin_setting (only_row, identity_name, token_hash) VALUES (1, ?, ?)
             ON CONFLICT (only_row) DO UPDATE SET identity_name = excluded.identity_name, token_hash = excluded.token_hash`,
            identity.name,
            hash,
          );
          if (alreadyApplied(facts)) {
            return "unchanged" as const;
          }
          yield* setOnlyTokenOf(db)(identity, hash);
          return "applied" as const;
        }),
      ),
  };
}

const ADMIN_SETTING_MIGRATION = `CREATE TABLE admin_setting (
     only_row INTEGER PRIMARY KEY CHECK (only_row = 1),
     identity_name TEXT NOT NULL,
     token_hash TEXT NOT NULL
   ) STRICT;`;

const POSTGRES_ADMIN_SETTING_MIGRATION: readonly string[] = [
  `CREATE TABLE admin_setting (
     only_row integer PRIMARY KEY CHECK (only_row = 1),
     identity_name text COLLATE "C" NOT NULL,
     token_hash text COLLATE "C" NOT NULL
   )`,
];

export {
  ADMIN_SETTING_MIGRATION,
  type AdminSettingSection,
  POSTGRES_ADMIN_SETTING_MIGRATION,
  memoryAdminSetting,
  sqlAdminSetting,
};
