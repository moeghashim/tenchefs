import { Effect, Option, Schema } from "effect";
import type { LoginLinkRedemption, LoginLinksSection, RedeemLoginLink } from "./login-links.ts";
import { credentialIn, rowOf } from "./login-credential-lookup-sqlite.ts";
import { linkGone, linkRedeemed } from "./login-links.ts";
import type { Fails } from "./errors.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { isFalse } from "./adapters/sql-database.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { lineageIn } from "./credential-lineage-sql.ts";
import { loginCredentialExpiry } from "./login-requests.ts";
import { newPublicId } from "./credential-lineage.ts";

const LinkRow = Schema.Struct({ identity_name: Schema.String.pipe(Schema.refine(isIdentityName)) });

type LinkRowType = typeof LinkRow.Type;

const linkRow = rowOf(Schema.decodeUnknownEffect(LinkRow));

const INSERT_LINK = "INSERT INTO login_links (link_hash, identity_name, created_at, expires_at) VALUES (?, ?, ?, ?)";

function findLive(db: SqlDatabase): string {
  return `SELECT l.identity_name FROM login_links AS l JOIN identities AS i ON i.name = l.identity_name
    WHERE l.link_hash = ? AND l.expires_at > ? AND i.kind = 'human' AND ${isFalse[db.dialect]("i.deactivated")}`;
}

const ISSUE_SESSION = `INSERT INTO login_credentials (hash, identity_name, host, created_at, last_used_at, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)`;

interface Redeeming {
  readonly db: SqlDatabase;
  readonly redeem: RedeemLoginLink;
  readonly publicId: Effect.Success<typeof newPublicId>;
}

function issueFrom({ db, publicId, redeem }: Redeeming) {
  const { credentialHash, host, linkHash, now } = redeem;
  return ({ identity_name: identity }: LinkRowType): Fails<LoginLinkRedemption> =>
    Effect.gen(function* issueSession() {
      yield* db.run("DELETE FROM login_links WHERE link_hash = ?", linkHash);
      yield* lineageIn(db).markEnded({ hash: linkHash, now, why: "redeemed" });
      yield* db.run(ISSUE_SESSION, credentialHash, identity, host, now, now, loginCredentialExpiry(now));
      yield* lineageIn(db).record({
        hash: credentialHash,
        identity,
        kind: "web",
        madeAt: now,
        parent: linkHash,
        publicId,
        where: host,
      });
      const issued = yield* credentialIn(db)(credentialHash);
      return Option.match(issued, { onNone: linkGone, onSome: linkRedeemed });
    });
}

function sqlLoginLinks(db: SqlDatabase): LoginLinksSection {
  return {
    addLoginLink: ({ createdAt, expiresAt, identity, linkHash, parent }) =>
      Effect.flatMap(newPublicId, (publicId) =>
        db.transaction(
          Effect.andThen(
            db.run(INSERT_LINK, linkHash, identity, createdAt, expiresAt),
            lineageIn(db).record({ hash: linkHash, identity, kind: "login link", madeAt: createdAt, parent, publicId }),
          ),
        ),
      ),
    redeemLoginLink: (redeem) =>
      Effect.flatMap(newPublicId, (publicId) =>
        db.transaction(
          Effect.gen(function* redeemLink() {
            yield* db.run("DELETE FROM login_links WHERE expires_at <= ?", redeem.now);
            const found = yield* Effect.flatMap(db.get(findLive(db), redeem.linkHash, redeem.now), linkRow);
            return yield* Option.match(found, {
              onNone: () => Effect.succeed(linkGone()),
              onSome: issueFrom({ db, publicId, redeem }),
            });
          }),
        ),
      ),
  };
}

export { sqlLoginLinks };
