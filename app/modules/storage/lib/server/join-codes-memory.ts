import { Effect, Option, Predicate, pipe } from "effect";
import type { EndedCredential, NewLineage } from "./credential-lineage.ts";
import { GONE, redemptionOf, sessionFor } from "./join-codes.ts";
import type { JoinCodeRedemption, JoinCodesSection, NewJoinCode, RedeemJoinCode } from "./join-codes.ts";
import type { AgentSessionsSection } from "./agent-sessions.ts";
import type { Ender } from "./credential-lineage-memory.ts";
import type { Fails } from "./errors.ts";
import type { FindIdentity } from "./identity-row.ts";
import type { MemoryState } from "./memory-state.ts";
import type { PublicId } from "../../../logins/index.ts";
import type { TokenHash } from "../../../identities/index.ts";
import { newPublicId } from "./credential-lineage.ts";

interface MemoryJoinCodesOptions {
  readonly state: MemoryState;
  readonly findIdentity: FindIdentity;
  readonly issueAgentSession: AgentSessionsSection["issueAgentSession"];
}

type Codes = Map<TokenHash, NewJoinCode>;

function enderOf(codes: Codes): Ender {
  return {
    end: (hash) => {
      codes.delete(hash);
    },
    live: (hash, now) =>
      pipe(
        Option.fromUndefinedOr(codes.get(hash)),
        Option.filter((code) => now < code.expiresAt),
        Option.map((code): EndedCredential => ({ hash, identity: code.agent, kind: "join code" })),
      ),
  };
}

function lineageOf({ agent, codeHash, createdAt, parent }: NewJoinCode, publicId: PublicId): NewLineage {
  return { hash: codeHash, identity: agent, kind: "join code", madeAt: createdAt, parent, publicId };
}

function memoryJoinCodes({ findIdentity, issueAgentSession, state }: MemoryJoinCodesOptions): JoinCodesSection {
  const codes: Codes = new Map();
  state.lineage.addEnder(enderOf(codes));
  function redeemFound(code: NewJoinCode, redeem: RedeemJoinCode): Fails<JoinCodeRedemption> {
    const agent = findIdentity(code.agent);
    if (Predicate.isUndefined(agent)) {
      return Effect.succeed(GONE);
    }
    if (agent.deactivated === true) {
      return Effect.succeed({ identity: code.agent, status: "deactivated" });
    }
    const issue = sessionFor({ agent: code.agent, redeem });
    return Effect.map(issueAgentSession(issue), (result) => {
      if (result.status === "issued") {
        codes.delete(redeem.codeHash);
        state.lineage.markEnded({ hash: redeem.codeHash, now: redeem.now, why: "redeemed" });
      }
      return redemptionOf({ issue, result });
    });
  }
  return {
    addJoinCode: (code) =>
      Effect.flatMap(newPublicId, (publicId) =>
        Effect.andThen(
          state.ensureOpen,
          Effect.sync(() => {
            codes.set(code.codeHash, { ...code });
            state.lineage.record(lineageOf(code, publicId));
          }),
        ),
      ),
    redeemJoinCode: (redeem) =>
      Effect.andThen(
        state.ensureOpen,
        Effect.suspend(() => {
          const code = codes.get(redeem.codeHash);
          if (Predicate.isUndefined(code) || redeem.now >= code.expiresAt) {
            codes.delete(redeem.codeHash);
            return Effect.succeed(GONE);
          }
          return redeemFound(code, redeem);
        }),
      ),
  };
}

export { memoryJoinCodes };
