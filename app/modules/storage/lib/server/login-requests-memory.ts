import type {
  ApproveLoginRequest,
  CollectLoginRequest,
  IssueLoginCredential,
  LoginCollection,
  LoginCredentialLookup,
  LoginRequest,
  LoginRequestsSection,
  NewLoginRequest,
  UseLoginCredential,
} from "./login-requests.ts";
import { Array as Arr, Effect, Option, pipe } from "effect";
import { EXPIRED, GONE, PENDING, UNKNOWN, collected, loginCredentialExpiry, originOf } from "./login-requests.ts";
import type { EndedCredential, LineageSection, NewLineage } from "./credential-lineage.ts";
import type { Ender, Ending, MemoryLineage } from "./credential-lineage-memory.ts";
import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import type { Fails } from "./errors.ts";
import type { FindIdentity } from "./identity-row.ts";
import type { HeldCredential } from "./login-sessions-memory.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { MemoryState } from "./memory-state.ts";
import { memorySessions } from "./login-sessions-memory.ts";
import { newPublicId } from "./credential-lineage.ts";

interface MemoryRequest {
  readonly request: NewLoginRequest;
  readonly approvedBy: Option.Option<IdentityName>;
  readonly approvedWith: Option.Option<TokenHash>;
}

type Requests = Map<TokenHash, MemoryRequest>;

type LoginCredentials = Map<TokenHash, HeldCredential>;

interface MemoryLoginRequestsOptions {
  readonly findIdentity: FindIdentity;
  readonly state: MemoryState;
}

interface Held {
  readonly credentials: LoginCredentials;
  readonly findIdentity: FindIdentity;
  readonly lineage: MemoryLineage;
}

type PublicId = NewLineage["publicId"];

interface MemoryLoginRequestsSection
  extends LoginRequestsSection,
    Pick<LineageSection, "listSessions" | "revokeSession"> {
  readonly dropLoginCredentials: (name: IdentityName) => Effect.Effect<void>;
}

function shown({ approvedBy, request }: MemoryRequest): LoginRequest {
  const { clientIp, createdAt, expiresAt, host, userAgent, userCode } = request;
  const origin = originOf({ clientIp, userAgent });
  return { ...origin, approved: Option.isSome(approvedBy), createdAt, expiresAt, host, userCode };
}

function dropExpired(requests: Requests, now: IsoTime): void {
  for (const [hash, { request }] of requests) {
    if (now >= request.expiresAt) {
      requests.delete(hash);
    }
  }
}

function liveByCode(requests: Requests, userCode: string, now: IsoTime): Option.Option<MemoryRequest> {
  dropExpired(requests, now);
  return Arr.findFirst([...requests.values()], ({ request }) => request.userCode === userCode);
}

function dropCredentialsOf({ credentials }: Held, name: IdentityName): void {
  for (const [hash, { identity: holder }] of credentials) {
    if (holder === name) {
      credentials.delete(hash);
    }
  }
}

function dropApprovedBy(requests: Requests, name: IdentityName): void {
  for (const [hash, { approvedBy }] of requests) {
    if (Option.exists(approvedBy, (approver) => approver === name)) {
      requests.delete(hash);
    }
  }
}

function identityOf(held: Held, name: IdentityName): Option.Option<Identity> {
  return Option.map(Option.fromUndefinedOr(held.findIdentity(name)), (found) => ({ ...found }));
}

function collectFrom(requests: Requests, held: Held) {
  return (
    { credentialHash, kind = "cli", now, requestHash }: CollectLoginRequest,
    publicId: PublicId,
  ): LoginCollection => {
    dropExpired(requests, now);
    const found = Option.filter(
      Option.fromUndefinedOr(requests.get(requestHash)),
      ({ request }) => (request.kind ?? "cli") === kind,
    );
    if (Option.isNone(found)) {
      return GONE;
    }
    if (Option.isNone(found.value.approvedBy)) {
      return PENDING;
    }
    requests.delete(requestHash);
    const identity = identityOf(held, found.value.approvedBy.value);
    return Option.match(identity, {
      onNone: () => GONE,
      onSome: (approver) => {
        held.credentials.set(credentialHash, { identity: approver.name, lastUsedAt: now });
        held.lineage.record({
          hash: credentialHash,
          identity: approver.name,
          kind,
          madeAt: now,
          parent: Option.getOrUndefined(found.value.approvedWith),
          publicId,
          where: found.value.request.host,
        });
        return collected(approver);
      },
    });
  };
}

function approveIn(requests: Requests) {
  return ({ approvedWith, approver, now, userCode }: ApproveLoginRequest): "approved" | "not_found" =>
    Option.match(liveByCode(requests, userCode, now), {
      onNone: () => "not_found",
      onSome: (found) => {
        if (Option.isNone(found.approvedBy)) {
          requests.set(found.request.requestHash, {
            approvedBy: Option.some(approver),
            approvedWith: Option.fromUndefinedOr(approvedWith),
            request: found.request,
          });
        }
        return "approved";
      },
    });
}

function addTo(requests: Requests) {
  return (request: NewLoginRequest, now: IsoTime): "added" | "code_taken" => {
    if (Option.isSome(liveByCode(requests, request.userCode, now))) {
      return "code_taken";
    }
    requests.set(request.requestHash, {
      approvedBy: Option.none(),
      approvedWith: Option.none(),
      request: { ...request },
    });
    return "added";
  };
}

function open<Value>(state: MemoryState, work: () => Value): Fails<Value> {
  return Effect.andThen(state.ensureOpen, Effect.sync(work));
}

function findCredentialIn(held: Held) {
  return (hash: TokenHash): Identity | undefined =>
    pipe(
      Option.fromUndefinedOr(held.credentials.get(hash)),
      Option.flatMap(({ identity }) => identityOf(held, identity)),
      Option.getOrUndefined,
    );
}

function issueStraightTo(held: Held) {
  return (
    { credentialHash, host, identity, now, parent }: IssueLoginCredential,
    publicId: PublicId,
  ): Identity | undefined =>
    pipe(
      identityOf(held, identity),
      Option.map((found) => {
        held.credentials.set(credentialHash, { identity: found.name, lastUsedAt: now });
        held.lineage.record({
          hash: credentialHash,
          identity,
          kind: "web",
          madeAt: now,
          parent,
          publicId,
          where: host,
        });
        return found;
      }),
      Option.getOrUndefined,
    );
}

interface FoundCredential {
  readonly credential: HeldCredential;
  readonly identity: Identity;
}

interface LookUp {
  readonly held: Held;
  readonly renew: boolean;
  readonly use: UseLoginCredential;
}

function foundIn(held: Held, hash: TokenHash): Option.Option<FoundCredential> {
  return Option.flatMap(Option.fromUndefinedOr(held.credentials.get(hash)), (credential) =>
    Option.map(identityOf(held, credential.identity), (identity) => ({ credential, identity })),
  );
}

function forget(held: Held, ending: Ending): void {
  held.credentials.delete(ending.hash);
  held.lineage.markEnded(ending);
}

function lastUseOf({ renew, use }: LookUp, credential: HeldCredential): IsoTime {
  if (renew) {
    return use.now;
  }
  return credential.lastUsedAt;
}

function lookedUp(lookUp: LookUp, { credential, identity }: FoundCredential): LoginCredentialLookup {
  const { held, renew, use } = lookUp;
  if (use.now >= loginCredentialExpiry(credential.lastUsedAt)) {
    if (renew) {
      forget(held, { hash: use.hash, now: use.now, why: "expired" });
    }
    return EXPIRED;
  }
  const lastUsedAt = lastUseOf(lookUp, credential);
  held.credentials.set(use.hash, { ...credential, lastUsedAt });
  return { expiresAt: loginCredentialExpiry(lastUsedAt), identity, lastUsedAt, status: "active" };
}

function lookUpIn(held: Held, renew: boolean) {
  return (use: UseLoginCredential): LoginCredentialLookup =>
    Option.match(foundIn(held, use.hash), {
      onNone: () => UNKNOWN,
      onSome: (found) => lookedUp({ held, renew, use }, found),
    });
}

function enderOf(held: Held): Ender {
  return {
    end: (hash) => {
      held.credentials.delete(hash);
    },
    live: (hash, now) =>
      pipe(
        Option.fromUndefinedOr(held.credentials.get(hash)),
        Option.filter(({ lastUsedAt }) => now < loginCredentialExpiry(lastUsedAt)),
        Option.map(({ identity }): EndedCredential => ({ hash, identity, kind: "session" })),
      ),
  };
}

function memoryLoginRequests({ findIdentity, state }: MemoryLoginRequestsOptions): MemoryLoginRequestsSection {
  const requests: Requests = new Map();
  const held: Held = { credentials: new Map(), findIdentity, lineage: state.lineage };
  state.lineage.addEnder(enderOf(held));
  const add = addTo(requests);
  const collect = collectFrom(requests, held);
  const findCredential = findCredentialIn(held);
  const issue = issueStraightTo(held);
  const sessions = memorySessions(held);
  const lookUp = { check: lookUpIn(held, false), use: lookUpIn(held, true) };
  return {
    addLoginRequest: (request, now) => open(state, () => add(request, now)),
    approveLoginRequest: (given) => open(state, () => approveIn(requests)(given)),
    checkLoginCredential: (given) => open(state, () => lookUp.check(given)),
    collectLoginRequest: (given) =>
      Effect.flatMap(newPublicId, (publicId) => open(state, () => collect(given, publicId))),
    dropLoginCredentials: (name) =>
      Effect.sync(() => {
        dropCredentialsOf(held, name);
        dropApprovedBy(requests, name);
      }),
    findLoginCredential: (hash) => open(state, () => findCredential(hash)),
    findLoginRequest: (userCode, now) =>
      open(state, () => pipe(liveByCode(requests, userCode, now), Option.map(shown), Option.getOrUndefined)),
    issueLoginCredential: (given) =>
      Effect.flatMap(newPublicId, (publicId) => open(state, () => issue(given, publicId))),
    listSessions: (given) => open(state, () => sessions.list(given)),
    revokeLoginCredential: (hash, now) =>
      open(state, () => {
        const had = held.credentials.has(hash);
        forget(held, { hash, now, why: "logged out" });
        return had;
      }),
    revokeSession: (given) => open(state, () => sessions.revoke(given)),
    useLoginCredential: (given) => open(state, () => lookUp.use(given)),
  };
}

export { memoryLoginRequests };
