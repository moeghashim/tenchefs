import type { DisplayName, Identity, IdentityName } from "../../../identities/index.ts";
import { Effect, Predicate, Schema } from "effect";
import { IdentityRow, toIdentity } from "./identity-row.ts";
import { memoryDescriptions, sqlDescriptions } from "./descriptions.ts";
import type { DescriptionsSection } from "./descriptions.ts";
import type { Fails } from "./errors.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { unreadable } from "./errors.ts";

type SetDisplayNameResult = { readonly status: "set"; readonly identity: Identity } | { readonly status: "not_found" };

interface DisplayNamesSection extends DescriptionsSection {
  readonly setDisplayName: (name: IdentityName, displayName: DisplayName | null) => Fails<SetDisplayNameResult>;
}

interface MemoryIdentityMap {
  readonly identities: Map<IdentityName, Identity>;
  readonly open: <Value>(work: () => Value) => Fails<Value>;
}

const NOT_FOUND: SetDisplayNameResult = { status: "not_found" };

function renamed(identity: Identity, displayName: DisplayName | null): Identity {
  const { displayName: _cleared, ...rest } = identity;
  if (displayName === null) {
    return rest;
  }
  return { ...rest, displayName };
}

function memoryDisplayNames({ identities, open }: MemoryIdentityMap): DisplayNamesSection {
  return {
    ...memoryDescriptions({ identities, open }),
    setDisplayName: (name, displayName) =>
      open(() => {
        const identity = identities.get(name);
        if (Predicate.isUndefined(identity)) {
          return NOT_FOUND;
        }
        const named = renamed(identity, displayName);
        identities.set(name, named);
        return { identity: { ...named }, status: "set" };
      }),
  };
}

function decodeRow(row: unknown): Fails<typeof IdentityRow.Type> {
  return Schema.decodeUnknownEffect(IdentityRow)(row).pipe(Effect.mapError(unreadable));
}

function sqlDisplayNames(db: SqlDatabase): DisplayNamesSection {
  return {
    ...sqlDescriptions(db),
    setDisplayName: (name, displayName) =>
      db.transaction(
        Effect.gen(function* setDisplayNameRow() {
          yield* db.run("UPDATE identities SET display_name = ? WHERE name = ?", displayName, name);
          const row = yield* db.get("SELECT * FROM identities WHERE name = ?", name);
          if (Predicate.isUndefined(row)) {
            return NOT_FOUND;
          }
          const decoded = yield* decodeRow(row);
          return { identity: toIdentity(decoded), status: "set" } as const;
        }),
      ),
  };
}

export { type DisplayNamesSection, memoryDisplayNames, sqlDisplayNames };
