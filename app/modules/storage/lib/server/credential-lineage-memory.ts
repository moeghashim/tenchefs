import { Array as Arr, Option, Predicate } from "effect";
import type { EndedCredential, EndedWhy, LogOutEverywhere, NewLineage } from "./credential-lineage.ts";
import type { IdentityName, TokenHash } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";

interface LineageRow extends NewLineage {
  readonly ended: Option.Option<{ readonly at: IsoTime; readonly why: EndedWhy }>;
}

interface Ender {
  readonly live: (hash: TokenHash, now: IsoTime) => Option.Option<EndedCredential>;
  readonly end: (hash: TokenHash) => void;
}

interface HeldToken {
  readonly hash: TokenHash;
  readonly revoked: boolean;
}

interface MemoryTokens {
  readonly activeTokens: ReadonlyMap<TokenHash, IdentityName>;
  readonly revokedTokens: ReadonlyMap<TokenHash, IdentityName>;
}

interface Ending {
  readonly hash: TokenHash;
  readonly why: EndedWhy;
  readonly now: IsoTime;
}

interface MemoryLineage {
  readonly record: (row: NewLineage) => void;
  readonly markEnded: (ending: Ending) => void;
  readonly addEnder: (ender: Ender) => void;
  readonly useTokens: (tokens: MemoryTokens) => void;
  readonly rowOf: (hash: TokenHash) => Option.Option<LineageRow>;
  readonly rows: () => readonly LineageRow[];
  readonly tokenHolderOf: (hash: TokenHash) => Option.Option<IdentityName>;
  readonly revokeTree: (hash: TokenHash, now: IsoTime) => readonly EndedCredential[];
  readonly revokeBelowRevokedTokens: (name: IdentityName, now: IsoTime) => readonly EndedCredential[];
  readonly endCredentialsOf: (name: IdentityName, now: IsoTime) => readonly EndedCredential[];
  readonly previewLogOutEverywhere: (request: LogOutEverywhere) => readonly EndedCredential[];
  readonly logOutEverywhere: (request: LogOutEverywhere) => readonly EndedCredential[];
}

const NO_TOKENS: MemoryTokens = { activeTokens: new Map(), revokedTokens: new Map() };

type Rows = Map<TokenHash, LineageRow>;

function childrenOf(rows: Rows, hash: TokenHash): readonly TokenHash[] {
  return Arr.map(
    Arr.filter([...rows.values()], (row) => row.parent === hash),
    (row) => row.hash,
  );
}

function treeOf(rows: Rows, roots: readonly TokenHash[]): readonly TokenHash[] {
  const seen = new Set<TokenHash>();
  const waiting = [...roots];
  for (let next = waiting.pop(); Predicate.isNotUndefined(next); next = waiting.pop()) {
    if (!seen.has(next)) {
      seen.add(next);
      waiting.push(...childrenOf(rows, next));
    }
  }
  return [...seen];
}

function heldBy(
  tokens: ReadonlyMap<TokenHash, IdentityName>,
  name: IdentityName,
  revoked: boolean,
): readonly HeldToken[] {
  return Arr.map(
    Arr.filter([...tokens.keys()], (hash) => tokens.get(hash) === name),
    (hash) => ({ hash, revoked }),
  );
}

function tokensOf({ activeTokens, revokedTokens }: MemoryTokens, name: IdentityName): readonly HeldToken[] {
  return [...heldBy(activeTokens, name, false), ...heldBy(revokedTokens, name, true)];
}

function holderOf({ activeTokens, revokedTokens }: MemoryTokens, hash: TokenHash): Option.Option<IdentityName> {
  return Option.orElse(Option.fromUndefinedOr(activeTokens.get(hash)), () =>
    Option.fromUndefinedOr(revokedTokens.get(hash)),
  );
}

function markEndedIn(rows: Rows): (ending: Ending) => void {
  return ({ hash, now, why }) => {
    const row = rows.get(hash);
    if (Predicate.isNotUndefined(row) && Option.isNone(row.ended)) {
      rows.set(hash, { ...row, ended: Option.some({ at: now, why }) });
    }
  };
}

function ownRoots(rows: Rows, name: IdentityName): readonly TokenHash[] {
  return Arr.map(
    Arr.filter([...rows.values()], (row) => row.identity === name && row.kind !== "join code"),
    (row) => row.hash,
  );
}

function everywhereBut(rows: Rows, roots: readonly TokenHash[], current: TokenHash | undefined): readonly TokenHash[] {
  const kept = new Set(treeOf(rows, Arr.fromNullishOr(current)));
  return Arr.filter(treeOf(rows, roots), (hash) => !kept.has(hash));
}

const NO_PARENT = Option.getOrUndefined(Option.none<TokenHash>());

function makeRoot(rows: Rows, current: TokenHash | undefined): void {
  for (const row of Arr.filter([...rows.values()], ({ hash }) => hash === current)) {
    rows.set(row.hash, { ...row, parent: NO_PARENT });
  }
}

type Enders = ReadonlySet<Ender>;

function liveAmong(enders: Enders, hashes: readonly TokenHash[], now: IsoTime): readonly EndedCredential[] {
  return Arr.flatMap(hashes, (hash) => Arr.getSomes(Arr.map([...enders], (ender) => ender.live(hash, now))));
}

function endEachIn(
  rows: Rows,
  enders: Enders,
): (hashes: readonly TokenHash[], now: IsoTime) => readonly EndedCredential[] {
  const markEnded = markEndedIn(rows);
  return (hashes, now) =>
    Arr.flatMap(hashes, (hash) => {
      const ended = liveAmong(enders, [hash], now);
      for (const ender of enders) {
        ender.end(hash);
      }
      markEnded({ hash, now, why: "revoked" });
      return ended;
    });
}

function newMemoryLineage(): MemoryLineage {
  const rows: Rows = new Map();
  const enders = new Set<Ender>();
  const tokens = { current: NO_TOKENS };
  const markEnded = markEndedIn(rows);
  function current(): MemoryTokens {
    return tokens.current;
  }
  const endEach = endEachIn(rows, enders);
  function rootsOf(name: IdentityName): readonly TokenHash[] {
    return [...Arr.map(tokensOf(current(), name), ({ hash }) => hash), ...ownRoots(rows, name)];
  }
  return {
    addEnder: (ender) => {
      enders.add(ender);
    },
    endCredentialsOf: (name, now) => endEach(treeOf(rows, rootsOf(name)), now),
    logOutEverywhere: ({ current: sent, identity, now }) => {
      const ended = endEach(everywhereBut(rows, rootsOf(identity), sent), now);
      makeRoot(rows, sent);
      return ended;
    },
    markEnded,
    previewLogOutEverywhere: ({ current: sent, identity, now }) =>
      liveAmong(enders, everywhereBut(rows, rootsOf(identity), sent), now),
    record: (row) => {
      rows.set(row.hash, { ...row, ended: Option.none() });
    },
    revokeBelowRevokedTokens: (name, now) => {
      const held = tokensOf(current(), name);
      const revoked = Arr.map(
        Arr.filter(held, (token) => token.revoked),
        ({ hash }) => hash,
      );
      return endEach(treeOf(rows, revoked), now);
    },
    revokeTree: (hash, now) => endEach(treeOf(rows, [hash]), now),
    rowOf: (hash) => Option.fromUndefinedOr(rows.get(hash)),
    rows: () => [...rows.values()],
    tokenHolderOf: (hash) => holderOf(current(), hash),
    useTokens: (next) => {
      tokens.current = next;
    },
  };
}

export { type Ender, type Ending, type MemoryLineage, newMemoryLineage };
