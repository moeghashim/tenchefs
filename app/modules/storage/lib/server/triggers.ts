import { Array as Arr, Effect, Option, Order, Predicate, Schema, String as Str } from "effect";
import type { TriggerHeader, TriggerResult, TriggerSkip, TriggerToken } from "../../../triggers/index.ts";
import { isOkStatus, isTriggerToken, triggerSkips } from "../../../triggers/index.ts";
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
  readonly headers?: readonly TriggerHeader[];
}

interface StoredTrigger {
  readonly url: string;
  readonly token: TriggerToken;
  readonly agent: IdentityName;
  readonly headers?: readonly TriggerHeader[];
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

function withHeaders(stored: StoredTrigger, headers: readonly TriggerHeader[]): StoredTrigger {
  if (Arr.isReadonlyArrayNonEmpty(headers)) {
    return { ...stored, headers };
  }
  return stored;
}

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
    setTrigger: (agent, trigger) =>
      open(() => {
        kept.set(agent, withHeaders({ agent, token: trigger.token, url: trigger.url }, trigger.headers ?? []));
      }),
  };
}

const HeadersJson = Schema.fromJsonString(Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.String })));

const encodeHeaders = Schema.encodeEffect(HeadersJson);

const TriggerRow = Schema.Struct({
  agent_name: Schema.String.pipe(Schema.refine(isIdentityName)),
  headers: HeadersJson,
  last_at: Schema.NullOr(IsoTimeSchema),
  last_error: Schema.NullOr(Schema.String),
  last_skipped: Schema.NullOr(Schema.Literals(triggerSkips)),
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

function skippedOr(at: TriggerResult["at"], skipped: TriggerSkip | null, status: number | null): TriggerResult {
  if (Predicate.isNull(skipped)) {
    return answered(at, status);
  }
  return { at, ok: true, skipped };
}

function resultOf({
  last_at: at,
  last_error: error,
  last_skipped: skipped,
  last_status: status,
}: Row): Option.Option<TriggerResult> {
  return Option.map(Option.fromNullishOr(at), (when) => {
    if (Predicate.isNull(error)) {
      return skippedOr(when, skipped, status);
    }
    if (Predicate.isNull(status)) {
      return { at: when, error, ok: false };
    }
    return { at: when, error, ok: false, status };
  });
}

function triggerOf(row: Row): StoredTrigger {
  const stored = withHeaders({ agent: row.agent_name, token: row.token, url: row.url }, row.headers);
  return Option.match(resultOf(row), { onNone: () => stored, onSome: (lastResult) => ({ ...stored, lastResult }) });
}

function triggersOf(rows: readonly unknown[]): Fails<readonly StoredTrigger[]> {
  return Schema.decodeUnknownEffect(Schema.Array(TriggerRow))(rows).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: Arr.map(triggerOf) }),
  );
}

const COLUMNS = "agent_name, url, token, headers, last_at, last_status, last_error, last_skipped";

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
    recordTriggerResult: (agent, { at, error, skipped, status }) =>
      db.run(
        "UPDATE triggers SET last_at = ?, last_status = ?, last_error = ?, last_skipped = ? WHERE agent_name = ?",
        at,
        status ?? null,
        error ?? null,
        skipped ?? null,
        agent,
      ),
    setTrigger: (agent, { headers = [], token, url }) =>
      Effect.flatMap(Effect.orDie(encodeHeaders(headers)), (json) =>
        db.run(
          `INSERT INTO triggers (agent_name, url, token, headers) VALUES (?, ?, ?, ?)
         ON CONFLICT (agent_name) DO UPDATE SET url = excluded.url, token = excluded.token, headers = excluded.headers,
           last_at = NULL, last_status = NULL, last_error = NULL, last_skipped = NULL`,
          agent,
          url,
          token,
          json,
        ),
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

const TRIGGER_HEADERS_MIGRATION = "ALTER TABLE triggers ADD COLUMN headers TEXT NOT NULL DEFAULT '[]';";

const POSTGRES_TRIGGER_HEADERS_MIGRATION: readonly string[] = [
  `ALTER TABLE triggers ADD COLUMN headers text COLLATE "C" NOT NULL DEFAULT '[]'`,
];

const TRIGGER_SKIPPED_MIGRATION = "ALTER TABLE triggers ADD COLUMN last_skipped TEXT;";

const POSTGRES_TRIGGER_SKIPPED_MIGRATION: readonly string[] = [
  `ALTER TABLE triggers ADD COLUMN last_skipped text COLLATE "C"`,
];

export {
  POSTGRES_TRIGGER_HEADERS_MIGRATION,
  POSTGRES_TRIGGER_SKIPPED_MIGRATION,
  POSTGRES_TRIGGERS_MIGRATION,
  TRIGGER_HEADERS_MIGRATION,
  TRIGGER_SKIPPED_MIGRATION,
  type StoredTrigger,
  TRIGGERS_MIGRATION,
  type TriggersSection,
  memoryTriggers,
  sqlTriggers,
};
