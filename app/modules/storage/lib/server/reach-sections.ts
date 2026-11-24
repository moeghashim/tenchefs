import { memoryPresence, sqlPresence } from "./presence.ts";
import { memoryTriggers, sqlTriggers } from "./triggers.ts";
import { Effect } from "effect";
import type { IdentityName } from "../../../identities/index.ts";
import type { MemoryState } from "./memory-state.ts";
import type { PresenceSection } from "./presence.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import type { TriggersSection } from "./triggers.ts";

type ReachSections = PresenceSection & TriggersSection;

type MemoryReachSections = ReachSections & {
  readonly dropPresence: (identity: IdentityName) => Effect.Effect<void>;
};

function memoryReach(state: MemoryState): MemoryReachSections {
  const { dropPresence, ...presence } = memoryPresence(state);
  const { dropTrigger, ...triggers } = memoryTriggers(state);
  return {
    ...presence,
    ...triggers,
    dropPresence: (identity) => Effect.andThen(dropPresence(identity), dropTrigger(identity)),
  };
}

function sqlReach(db: SqlDatabase): ReachSections {
  return { ...sqlPresence(db), ...sqlTriggers(db) };
}

export { memoryReach, sqlReach };
