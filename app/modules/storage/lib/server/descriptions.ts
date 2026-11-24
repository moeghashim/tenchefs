import type { AgentIdentity, Identity, IdentityName } from "../../../identities/index.ts";
import { AgentRow, toIdentity } from "./identity-row.ts";
import { Effect, Predicate, Schema } from "effect";
import type { Description } from "../../../identities/client.ts";
import type { Fails } from "./errors.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { unreadable } from "./errors.ts";

type SetDescriptionResult = { readonly status: "set"; readonly identity: Identity } | { readonly status: "not_found" };

interface DescriptionsSection {
  readonly setDescription: (name: IdentityName, description: Description | null) => Fails<SetDescriptionResult>;
}

interface MemoryIdentityMap {
  readonly identities: Map<IdentityName, Identity>;
  readonly open: <Value>(work: () => Value) => Fails<Value>;
}

const NOT_FOUND: SetDescriptionResult = { status: "not_found" };

function described(agent: AgentIdentity, description: Description | null): AgentIdentity {
  const { description: _cleared, ...rest } = agent;
  if (description === null) {
    return rest;
  }
  return { ...rest, description };
}

function memoryDescriptions({ identities, open }: MemoryIdentityMap): DescriptionsSection {
  return {
    setDescription: (name, description) =>
      open(() => {
        const identity = identities.get(name);
        if (Predicate.isUndefined(identity) || identity.kind !== "agent") {
          return NOT_FOUND;
        }
        const changed = described(identity, description);
        identities.set(name, changed);
        return { identity: { ...changed }, status: "set" };
      }),
  };
}

function decodeRow(row: unknown): Fails<typeof AgentRow.Type> {
  return Schema.decodeUnknownEffect(AgentRow)(row).pipe(Effect.mapError(unreadable));
}

function sqlDescriptions(db: SqlDatabase): DescriptionsSection {
  return {
    setDescription: (name, description) =>
      db.transaction(
        Effect.gen(function* setDescriptionRow() {
          yield* db.run("UPDATE identities SET description = ? WHERE name = ? AND kind = 'agent'", description, name);
          const row = yield* db.get("SELECT * FROM identities WHERE name = ? AND kind = 'agent'", name);
          if (Predicate.isUndefined(row)) {
            return NOT_FOUND;
          }
          const decoded = yield* decodeRow(row);
          return { identity: toIdentity(decoded), status: "set" } as const;
        }),
      ),
  };
}

export { type DescriptionsSection, memoryDescriptions, sqlDescriptions };
