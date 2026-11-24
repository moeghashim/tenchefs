import { Effect, Option, Predicate, Schema } from "effect";
import { GONE, redemptionOf, sessionFor } from "./join-codes.ts";
import type { JoinCodeRedemption, JoinCodesSection, RedeemJoinCode } from "./join-codes.ts";
import type { Fails } from "./errors.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { agentSessionIssuer } from "./agent-sessions-sqlite.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { unreadable } from "./errors.ts";

const ACTIVE = 0;
const DEACTIVATED = 1;

const CodeRow = Schema.Struct({
  agent: Schema.String.pipe(Schema.refine(isIdentityName)),
  deactivated: Schema.Literals([ACTIVE, DEACTIVATED]),
});

type CodeRowType = typeof CodeRow.Type;

const FIND_LIVE = `SELECT join_codes.agent AS agent, identities.deactivated AS deactivated
  FROM join_codes JOIN identities ON identities.name = join_codes.agent
  WHERE join_codes.code_hash = ? AND join_codes.expires_at > ?`;

const decodeRow = Schema.decodeUnknownEffect(CodeRow);

function codeRow(row: unknown): Fails<Option.Option<CodeRowType>> {
  if (!Predicate.isObject(row)) {
    return Effect.succeedNone;
  }
  return Effect.mapBoth(decodeRow(row), { onFailure: unreadable, onSuccess: Option.some });
}

function redeemFound(db: SqlDatabase, redeem: RedeemJoinCode) {
  return (row: CodeRowType): Fails<JoinCodeRedemption> =>
    Effect.gen(function* issueForCode() {
      if (row.deactivated === DEACTIVATED) {
        return { identity: row.agent, status: "deactivated" } as const;
      }
      const issue = sessionFor({ agent: row.agent, redeem });
      const result = yield* agentSessionIssuer(db)(issue);
      if (result.status === "issued") {
        yield* db.run("DELETE FROM join_codes WHERE code_hash = ?", redeem.codeHash);
      }
      return redemptionOf({ issue, result });
    });
}

function sqlJoinCodes(db: SqlDatabase): JoinCodesSection {
  return {
    addJoinCode: ({ agent, codeHash, createdAt, expiresAt }) =>
      db.run(
        "INSERT INTO join_codes (code_hash, agent, created_at, expires_at) VALUES (?, ?, ?, ?)",
        codeHash,
        agent,
        createdAt,
        expiresAt,
      ),
    redeemJoinCode: (redeem) =>
      db.transaction(
        Effect.gen(function* redeemCode() {
          yield* db.run("DELETE FROM join_codes WHERE expires_at <= ?", redeem.now);
          const found = yield* Effect.flatMap(db.get(FIND_LIVE, redeem.codeHash, redeem.now), codeRow);
          return yield* Option.match(found, {
            onNone: () => Effect.succeed(GONE),
            onSome: redeemFound(db, redeem),
          });
        }),
      ),
  };
}

export { sqlJoinCodes };
