import { Array as Arr, Effect, Option, Order } from "effect";
import type { EndedCredential, Storage, StorageUnavailable } from "../../server.ts";
import { identityFixture as identity, isoTime } from "../../../testing/server.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { PublicId } from "../../../logins/index.ts";
import type { TokenHash } from "../../../identities/index.ts";
import { expect } from "@effect/vitest";
import { isPublicId } from "../../../logins/index.ts";
import { tokenHash } from "../../../identities/index.ts";

const made = isoTime("2026-01-01T00:00:00.000Z");
const later = isoTime("2026-01-01T00:05:00.000Z");
const requestsEnd = isoTime("2026-12-01T00:00:00.000Z");
const longUnused = isoTime("2026-05-01T00:00:00.000Z");
const ada = identity("ada", { kind: "human" });
const bob = identity("bob", { kind: "human" });
const agent = identity("triage-agent", { kind: "agent", owner: ada.name });
const adaToken = tokenHash("hash:ada");
const agentToken = tokenHash("hash:agent");
const WEEK = 604_800;
const ONE_AT_A_TIME = { concurrency: 1 } as const;

type Store = Storage["Service"];

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

type Revoked = Effect.Success<ReturnType<Store["revokeSession"]>>;

function publicIdOf(text: string): PublicId {
  if (isPublicId(text)) {
    return text;
  }
  return expect.unreachable(`${text} is not a public ID.`);
}

const UNKNOWN_ID = publicIdOf("0000000000000000");

interface Approving {
  readonly storage: Store;
  readonly hash: TokenHash;
  readonly approvedWith: TokenHash;
  readonly now?: IsoTime;
}

function approvedSession({ approvedWith, hash, now = made, storage }: Approving): Fails<void> {
  const requestHash = tokenHash(`request:${hash}`);
  const userCode = `code of ${hash}`;
  return Effect.gen(function* approveThenCollect() {
    yield* storage.addLoginRequest(
      { createdAt: now, expiresAt: requestsEnd, host: `host of ${hash}`, requestHash, userCode },
      now,
    );
    yield* storage.approveLoginRequest({ approvedWith, approver: ada.name, now, userCode });
    yield* storage.collectLoginRequest({ credentialHash: hash, now, requestHash });
  });
}

function agentSessionApprovedBy({ approvedWith, hash, now = made, storage }: Approving): Fails<void> {
  const requestHash = tokenHash(`request:${hash}`);
  const userCode = `code of ${hash}`;
  return Effect.gen(function* approveThenCollectJoin() {
    yield* storage.addAgentJoinRequest(
      { agent: agent.name, createdAt: now, expiresAt: requestsEnd, host: "build-box", requestHash, userCode },
      now,
    );
    yield* storage.approveAgentJoinRequest(
      userCode,
      { created: false, force: true, identity: agent.name, idleSeconds: WEEK, parent: approvedWith },
      now,
    );
    yield* storage.collectAgentJoinRequest({ now, requestHash, sessionHash: hash });
  });
}

interface Pasting {
  readonly storage: Store;
  readonly hash: TokenHash;
  readonly parent?: TokenHash;
}

function webSessionPastedWith({ hash, parent, storage }: Pasting): Fails<unknown> {
  return storage.issueLoginCredential({
    credentialHash: hash,
    host: "Firefox on macOS",
    identity: ada.name,
    now: made,
    parent,
  });
}

function withPeople(storage: Store): Fails<void> {
  return Effect.all(
    [
      storage.createIdentity(ada, adaToken),
      storage.createIdentity(bob, tokenHash("hash:bob")),
      storage.createIdentity(agent, agentToken),
    ],
    { ...ONE_AT_A_TIME, discard: true },
  );
}

interface Asking {
  readonly storage: Store;
  readonly hashes: readonly TokenHash[];
  readonly now?: IsoTime;
}

function liveOf({ hashes, now = later, storage }: Asking): Fails<readonly boolean[]> {
  return Effect.forEach(
    hashes,
    (hash) =>
      Effect.zipWith(
        storage.checkLoginCredential({ hash, now }),
        storage.useAgentSession({ hash, now }),
        (login, session) => login.status === "active" || session.status === "active",
      ),
    ONE_AT_A_TIME,
  );
}

interface Finding {
  readonly storage: Store;
  readonly hash: TokenHash;
  readonly now?: IsoTime;
}

function idOf({ hash, now = later, storage }: Finding): Fails<PublicId> {
  return Effect.map(storage.listSessions({ current: hash, identity: ada.name, now }), (sessions) =>
    Option.match(
      Arr.findFirst(sessions, ({ current }) => current),
      { onNone: () => UNKNOWN_ID, onSome: ({ id }) => id },
    ),
  );
}

function hashesOf(ended: readonly EndedCredential[]): readonly TokenHash[] {
  return Arr.sort(
    Arr.map(ended, ({ hash }) => hash),
    Order.String,
  );
}

function revokedHashes(revoked: Revoked): readonly TokenHash[] {
  if (revoked.status === "revoked") {
    return hashesOf(revoked.ended);
  }
  return [];
}

const [first, approvedByFirst, sibling, workerSession] = [
  tokenHash("hash:first"),
  tokenHash("hash:approved-by-first"),
  tokenHash("hash:sibling"),
  tokenHash("hash:worker-session"),
];

export {
  type Store,
  ONE_AT_A_TIME,
  UNKNOWN_ID,
  WEEK,
  ada,
  adaToken,
  agent,
  agentSessionApprovedBy,
  agentToken,
  approvedByFirst,
  approvedSession,
  bob,
  first,
  hashesOf,
  idOf,
  later,
  liveOf,
  longUnused,
  made,
  requestsEnd,
  revokedHashes,
  sibling,
  webSessionPastedWith,
  withPeople,
  workerSession,
};
