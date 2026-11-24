import { Array as Arr, Effect, Option, Order, Predicate, Schema, String as Str } from "effect";
import type { TriggerResult, TriggerToken } from "../../../triggers/index.ts";
import { isOkStatus, isTriggerToken } from "../../../triggers/index.ts";
import type { Fails } from "./errors.ts";
import type { IdentityName } from "../../../identities/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { MemoryState } from "./memory-state.ts";
import type { SqlDatabase } from "./adapters/sql-database.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { unreadable } from "./errors.ts";

interface NewTrigger {
  readonly url: string;
  readonly token: TriggerToken;
}

interface StoredTrigger {
  readonly url: string;
  readonly token: TriggerToken;
  readonly agent: IdentityName;
  readonly lastResult?: TriggerResult;
}

interface TriggersSection {
  readonly setTrigger: (agent: IdentityName, trigger: NewTrigger) => Fails<void>;
  readonly clearTrigger: (agent: IdentityName) => Fails<boolean>;
  readonly findTrigger: (agent: IdentityName) => Fails<StoredTrigger | undefined>;
  readonly listTriggers: (agents: readonly IdentityName[]) => Fails<readonly StoredTrigger[]>;
  readonly recordTriggerResult: (agent: IdentityName, result: TriggerResult) => Fails<void>;
}

type MemoryTriggersSection = TriggersSection & {
  readonly dropTrigger: (agent: IdentityName) => Effect.Effect<void>;
};

function among(agents: readonly IdentityName[]): (trigger: StoredTrigger) => boolean {
  const named = new Set(agents);
  return (trigger) => named.has(trigger.agent);
}

const byAgent = Order.mapInput(Str.Order, (trigger: StoredTrigger) => trigger.agent);

function memoryTriggers(state: MemoryState): MemoryTriggersSection {
  const kept = new Map<IdentityName, StoredTrigger>();
  function open<Value>(work: () => Value): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Effect.sync(work));
  }
  return {
    clearTrigger: (agent) => open(() => kept.delete(agent)),
    dropTrigger: (agent) =>
      Effect.sync(() => {
        kept.delete(agent);
      }),
    findTrigger: (agent) => open(() => kept.get(agent)),
    listTriggers: (agents) => open(() => Arr.sort(Arr.filter(kept.values(), among(agents)), byAgent)),
    recordTriggerResult: (agent, lastResult) =>
      open(() => {
        const found = kept.get(agent);
        if (Predicate.isNotUndefined(found)) {
          kept.set(agent, { ...found, lastResult });
        }
      }),
    setTrigger: (agent, { token, url }) =>
      open(() => {
        kept.set(agent, { agent, token, url });
      }),
  };
}

const TriggerRow = Schema.Struct({
  agent_name: Schema.String.pipe(Schema.refine(isIdentityName)),
  last_at: Schema.NullOr(IsoTimeSchema),
  last_error: Schema.NullOr(Schema.String),
  last_status: Schema.NullOr(Schema.Int),
  token: Schema.String.pipe(Schema.refine(isTriggerToken)),
  url: Schema.String,
});

type Row = typeof TriggerRow.Type;

function answered(at: TriggerResult["at"], status: number | null): TriggerResult {
  if (Predicate.isNull(status)) {
    return { at, ok: false };
  }
  return { at, ok: isOkStatus(status), status };
}

function resultOf({ last_at: at, last_error: error, last_status: status }: Row): Option.Option<TriggerResult> {
  return Option.map(Option.fromNullishOr(at), (when) => {
    if (Predicate.isNull(error)) {
      return answered(when, status);
    }
    return { at: when, error, ok: false };
  });
}

function triggerOf(row: Row): StoredTrigger {
  const stored = { agent: row.agent_name, token: row.token, url: row.url };
  return Option.match(resultOf(row), { onNone: () => stored, onSome: (lastResult) => ({ ...stored, lastResult }) });
}

function triggersOf(rows: readonly unknown[]): Fails<readonly StoredTrigger[]> {
  return Schema.decodeUnknownEffect(Schema.Array(TriggerRow))(rows).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: Arr.map(triggerOf) }),
  );
}

const COLUMNS = "agent_name, url, token, last_at, last_status, last_error";

function sqlTriggers(db: SqlDatabase): TriggersSection {
  return {
    clearTrigger: (agent) =>
      Effect.map(
        db.all("DELETE FROM triggers WHERE agent_name = ? RETURNING agent_name", agent),
        Arr.isReadonlyArrayNonEmpty,
      ),
    findTrigger: (agent) =>
      Effect.flatMap(db.all(`SELECT ${COLUMNS} FROM triggers WHERE agent_name = ?`, agent), triggersOf).pipe(
        Effect.map((found) => Option.getOrUndefined(Arr.head(found))),
      ),
    listTriggers: (agents) => {
      const listed = Effect.flatMap(db.all(`SELECT ${COLUMNS} FROM triggers ORDER BY agent_name`), triggersOf);
      return Effect.map(listed, Arr.filter(among(agents)));
    },
    recordTriggerResult: (agent, { at, error, status }) =>
      db.run(
        "UPDATE triggers SET last_at = ?, last_status = ?, last_error = ? WHERE agent_name = ?",
        at,
        status ?? null,
        error ?? null,
        agent,
      ),
    setTrigger: (agent, { token, url }) =>
      db.run(
        `INSERT INTO triggers (agent_name, url, token) VALUES (?, ?, ?)
         ON CONFLICT (agent_name) DO UPDATE SET url = excluded.url, token = excluded.token,
           last_at = NULL, last_status = NULL, last_error = NULL`,
        agent,
        url,
        token,
      ),
  };
}

const TRIGGERS_MIGRATION = `CREATE TABLE triggers (
     agent_name TEXT PRIMARY KEY REFERENCES identities (name) ON DELETE CASCADE,
     url TEXT NOT NULL,
     token TEXT NOT NULL,
     last_at TEXT,
     last_status INTEGER,
     last_error TEXT
   ) STRICT;
   ALTER TABLE offline_alerts ADD COLUMN trigger_message INTEGER;
   ALTER TABLE offline_alerts ADD COLUMN trigger_status INTEGER;
   ALTER TABLE offline_alerts ADD COLUMN trigger_error TEXT;`;

const POSTGRES_TRIGGERS_MIGRATION: readonly string[] = [
  `CREATE TABLE triggers (
     agent_name text COLLATE "C" PRIMARY KEY REFERENCES identities (name) ON DELETE CASCADE,
     url text COLLATE "C" NOT NULL,
     token text COLLATE "C" NOT NULL,
     last_at text COLLATE "C",
     last_status integer,
     last_error text COLLATE "C"
   )`,
  "ALTER TABLE offline_alerts ADD COLUMN trigger_message bigint",
  "ALTER TABLE offline_alerts ADD COLUMN trigger_status integer",
  `ALTER TABLE offline_alerts ADD COLUMN trigger_error text COLLATE "C"`,
];

export {
  POSTGRES_TRIGGERS_MIGRATION,
  type StoredTrigger,
  TRIGGERS_MIGRATION,
  type TriggersSection,
  memoryTriggers,
  sqlTriggers,
};
