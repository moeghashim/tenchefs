import { Array as Arr, Option, Order, pipe } from "effect";
import type { IdentityName, TokenHash } from "../../../identities/index.ts";
import type { ListSessions, ListedSession, RevokeSession, RevokeSessionResult } from "./credential-lineage.ts";
import { isSessionKind, madeByOf, unnamedWhere } from "./credential-lineage.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { MemoryLineage } from "./credential-lineage-memory.ts";
import { loginCredentialExpiry } from "./login-requests.ts";

interface HeldCredential {
  readonly identity: IdentityName;
  readonly lastUsedAt: IsoTime;
}

interface SessionsHeld {
  readonly credentials: ReadonlyMap<TokenHash, HeldCredential>;
  readonly lineage: MemoryLineage;
}

type LineageRow = ReturnType<MemoryLineage["rows"]>[number];

const BY_MADE_AT = Order.mapInput(Order.String, ({ madeAt }: ListedSession) => madeAt);
const BY_ID = Order.mapInput(Order.String, ({ id }: ListedSession) => id);

interface LiveAt {
  readonly identity: IdentityName;
  readonly now: IsoTime;
}

function isLiveFor(credential: HeldCredential, { identity, now }: LiveAt): boolean {
  return credential.identity === identity && now < loginCredentialExpiry(credential.lastUsedAt);
}

function madeByFor(lineage: MemoryLineage, row: LineageRow, identity: IdentityName): ReturnType<typeof madeByOf> {
  const parentHash = Option.fromUndefinedOr(row.parent);
  const parent = Option.flatMap(parentHash, lineage.rowOf);
  return madeByOf({
    identity,
    parentIdentity: Option.getOrUndefined(Option.map(parent, (found) => found.identity)),
    parentKind: Option.getOrUndefined(Option.map(parent, (found) => found.kind)),
    parentWhere: Option.getOrElse(
      Option.flatMapNullishOr(parent, (found) => found.where),
      unnamedWhere,
    ),
    tokenHolder: Option.getOrUndefined(Option.flatMap(parentHash, lineage.tokenHolderOf)),
  });
}

interface Listing {
  readonly held: SessionsHeld;
  readonly list: ListSessions;
  readonly credential: HeldCredential;
}

function listedOf({ credential, held, list }: Listing): (row: LineageRow) => Option.Option<ListedSession> {
  return (row) => {
    const { kind } = row;
    if (!isSessionKind(kind) || !isLiveFor(credential, list)) {
      return Option.none();
    }
    return Option.some({
      current: row.hash === list.current,
      expiresAt: loginCredentialExpiry(credential.lastUsedAt),
      id: row.publicId,
      kind,
      lastUsedAt: credential.lastUsedAt,
      madeAt: row.madeAt,
      where: Option.getOrElse(Option.fromUndefinedOr(row.where), unnamedWhere),
      ...madeByFor(held.lineage, row, list.identity),
    });
  };
}

function listIn(held: SessionsHeld, list: ListSessions): readonly ListedSession[] {
  return pipe(
    [...held.credentials.keys()],
    Arr.map((hash) =>
      Option.flatMap(Option.fromUndefinedOr(held.credentials.get(hash)), (credential) =>
        Option.flatMap(held.lineage.rowOf(hash), listedOf({ credential, held, list })),
      ),
    ),
    Arr.getSomes,
    Arr.sortBy(BY_MADE_AT, BY_ID),
  );
}

function revokeIn(held: SessionsHeld, { id, identity, now }: RevokeSession): RevokeSessionResult {
  const found = Arr.findFirst(held.lineage.rows(), (row) =>
    Option.exists(
      Option.fromUndefinedOr(held.credentials.get(row.hash)),
      (credential) => row.publicId === id && isLiveFor(credential, { identity, now }),
    ),
  );
  return Option.match(found, {
    onNone: () => ({ status: "not_found" }),
    onSome: ({ hash }) => ({ ended: held.lineage.revokeTree(hash, now), status: "revoked" }),
  });
}

interface MemorySessions {
  readonly list: (list: ListSessions) => readonly ListedSession[];
  readonly revoke: (revoke: RevokeSession) => RevokeSessionResult;
}

function memorySessions(held: SessionsHeld): MemorySessions {
  return { list: (list) => listIn(held, list), revoke: (revoke) => revokeIn(held, revoke) };
}

export { type HeldCredential, memorySessions };
