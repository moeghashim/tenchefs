import { Array as Arr, Effect, Number as Num, Option, Order, Predicate, Schema } from "effect";
import { FALSE, TRUE, isFalse } from "./adapters/sql-database.ts";
import type { OfflineAlert, OfflineAlertId, OfflineReason } from "../../../presence/index.ts";
import type { SqlDatabase, SqlValue } from "./adapters/sql-database.ts";
import { isOfflineAlertId, offlineReasons } from "../../../presence/index.ts";
import type { Fails } from "./errors.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { MemoryState } from "./memory-state.ts";
import type { TriggerFailure } from "../../../triggers/index.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { isMessageId } from "../../../messages/index.ts";
import { unreadable } from "./errors.ts";

interface NewOfflineAlert {
  readonly agent: IdentityName;
  readonly owner: IdentityName;
  readonly offlineReason: OfflineReason;
  readonly raisedAt: IsoTime;
  readonly trigger?: TriggerFailure;
}

interface OfflineAlertsSection {
  readonly recordOfflineAlert: (alert: NewOfflineAlert) => Fails<OfflineAlert>;
  readonly listOfflineAlerts: (owner: IdentityName) => Fails<readonly OfflineAlert[]>;
  readonly markOfflineAlertRead: (owner: IdentityName, id: OfflineAlertId) => Fails<OfflineAlert | null>;
  readonly markOfflineAlertsRead: (owner: IdentityName, upTo: OfflineAlertId) => Fails<readonly OfflineAlert[]>;
  readonly markBackOnline: (agent: IdentityName, at: IsoTime) => Fails<readonly OfflineAlert[]>;
  readonly markTriggerAlertsCleared: (agent: IdentityName, at: IsoTime) => Fails<readonly OfflineAlert[]>;
}

type StoredAlert = OfflineAlert & { readonly owner: IdentityName };

interface Change {
  readonly matches: (alert: StoredAlert) => boolean;
  readonly change: (alert: StoredAlert) => StoredAlert;
}

const STEP = 1;
const UNREAD = 0;
const READ = 1;

const TRIGGER_FAILED: OfflineReason = "trigger failed";

function isWaiting(alert: StoredAlert): boolean {
  return Predicate.isUndefined(alert.backOnlineAt);
}

function backAt(agent: IdentityName, at: IsoTime, triggerFailed: boolean): Change {
  return {
    change: (alert) => ({ ...alert, backOnlineAt: at }),
    matches: (alert) =>
      alert.agent === agent && isWaiting(alert) && (alert.offlineReason === TRIGGER_FAILED) === triggerFailed,
  };
}

const byId = Order.mapInput(Num.Order, (alert: OfflineAlert) => alert.id);

function sortedById(alerts: readonly OfflineAlert[]): readonly OfflineAlert[] {
  return Arr.sort(alerts, byId);
}

function withoutOwner({ owner: _owner, ...alert }: StoredAlert): OfflineAlert {
  return alert;
}

function alertIdOf(value: number): OfflineAlertId {
  return Option.getOrThrow(Option.liftPredicate(value, isOfflineAlertId));
}

function markedRead(alert: StoredAlert): StoredAlert {
  return { ...alert, read: true };
}

function changedIf({ change, matches }: Change): (alert: StoredAlert) => StoredAlert {
  return (alert) => {
    if (matches(alert)) {
      return change(alert);
    }
    return alert;
  };
}

type MemoryOfflineAlertsSection = OfflineAlertsSection & {
  readonly dropOfflineAlerts: (identity: IdentityName) => Effect.Effect<void>;
};

function memoryOfflineAlerts(state: MemoryState): MemoryOfflineAlertsSection {
  let alerts: readonly StoredAlert[] = [];
  let raised = 0;
  function changed(change: Change): readonly OfflineAlert[] {
    const changing = Arr.filter(alerts, change.matches);
    alerts = Arr.map(alerts, changedIf(change));
    return Arr.map(changing, (alert) => withoutOwner(change.change(alert)));
  }
  function open<Value>(work: () => Value): Fails<Value> {
    return Effect.andThen(state.ensureOpen, Effect.sync(work));
  }
  return {
    dropOfflineAlerts: (identity) =>
      Effect.sync(() => {
        alerts = Arr.filter(alerts, ({ agent, owner }) => agent !== identity && owner !== identity);
      }),
    listOfflineAlerts: (owner) =>
      open(() =>
        Arr.map(
          Arr.filter(alerts, (alert) => alert.owner === owner),
          withoutOwner,
        ),
      ),
    markBackOnline: (agent, at) => open(() => changed(backAt(agent, at, false))),
    markOfflineAlertRead: (owner, id) =>
      open(() =>
        Option.getOrNull(
          Arr.head(changed({ change: markedRead, matches: (alert) => alert.owner === owner && alert.id === id })),
        ),
      ),
    markOfflineAlertsRead: (owner, upTo) =>
      open(() =>
        changed({ change: markedRead, matches: (alert) => alert.owner === owner && alert.id <= upTo && !alert.read }),
      ),
    markTriggerAlertsCleared: (agent, at) => open(() => changed(backAt(agent, at, true))),
    recordOfflineAlert: (alert) =>
      open(() => {
        raised += STEP;
        const stored = { ...alert, id: alertIdOf(raised), read: false };
        alerts = [...alerts, stored];
        return withoutOwner(stored);
      }),
  };
}

const MessageIdColumn = Schema.Int.pipe(Schema.refine(isMessageId));

const AlertRow = Schema.Struct({
  agent_name: Schema.String.pipe(Schema.refine(isIdentityName)),
  back_online_at: Schema.NullOr(IsoTimeSchema),
  id: Schema.Int.pipe(Schema.refine(isOfflineAlertId)),
  offline_reason: Schema.Literals(offlineReasons),
  raised_at: IsoTimeSchema,
  read: Schema.Literals([UNREAD, READ]),
  trigger_error: Schema.NullOr(Schema.String),
  trigger_message: Schema.NullOr(MessageIdColumn),
  trigger_status: Schema.NullOr(Schema.Int),
});

type Row = typeof AlertRow.Type;

function failureOf({ trigger_error: error, trigger_status: status }: Row): Omit<TriggerFailure, "message"> {
  if (Predicate.isNotNull(error)) {
    return { error };
  }
  if (Predicate.isNotNull(status)) {
    return { status };
  }
  return {};
}

function triggerOf(row: Row): Pick<OfflineAlert, "trigger"> {
  const message = row.trigger_message;
  if (Predicate.isNull(message)) {
    return {};
  }
  return { trigger: { message, ...failureOf(row) } };
}

function alertOf(row: Row): OfflineAlert {
  const alert = {
    agent: row.agent_name,
    id: row.id,
    offlineReason: row.offline_reason,
    raisedAt: row.raised_at,
    read: row.read === READ,
    ...triggerOf(row),
  };
  if (Predicate.isNull(row.back_online_at)) {
    return alert;
  }
  return { ...alert, backOnlineAt: row.back_online_at };
}

function alertsOf(rows: readonly unknown[]): Fails<readonly OfflineAlert[]> {
  return Schema.decodeUnknownEffect(Schema.Array(AlertRow))(rows).pipe(
    Effect.mapBoth({ onFailure: unreadable, onSuccess: Arr.map(alertOf) }),
  );
}

function firstOf(alerts: readonly OfflineAlert[]): Fails<OfflineAlert> {
  return Effect.mapError(Effect.fromOption(Arr.head(alerts)), unreadable);
}

const COLUMNS =
  "id, agent_name, offline_reason, raised_at, read, back_online_at, trigger_message, trigger_status, trigger_error";

type TriggerColumns = readonly [SqlValue, SqlValue, SqlValue];

const NO_TRIGGER: TriggerColumns = [null, null, null];

function triggerColumns(trigger: TriggerFailure | undefined): TriggerColumns {
  return Option.match(Option.fromUndefinedOr(trigger), {
    onNone: () => NO_TRIGGER,
    onSome: ({ error = null, message, status = null }) => [message, status, error],
  });
}

function markedBack(db: SqlDatabase, reasonTest: string) {
  return (agent: IdentityName, at: IsoTime): Fails<readonly OfflineAlert[]> =>
    Effect.flatMap(
      db.all(
        `UPDATE offline_alerts SET back_online_at = ? WHERE agent_name = ? AND back_online_at IS NULL
         AND offline_reason ${reasonTest} ? RETURNING ${COLUMNS}`,
        at,
        agent,
        TRIGGER_FAILED,
      ),
      alertsOf,
    ).pipe(Effect.map(sortedById));
}

function sqlOfflineAlerts(db: SqlDatabase): OfflineAlertsSection {
  return {
    listOfflineAlerts: (owner) =>
      Effect.flatMap(db.all(`SELECT ${COLUMNS} FROM offline_alerts WHERE owner_name = ? ORDER BY id`, owner), alertsOf),
    markBackOnline: markedBack(db, "<>"),
    markOfflineAlertRead: (owner, id) =>
      Effect.flatMap(
        db.all(
          `UPDATE offline_alerts SET read = ${TRUE[db.dialect]} WHERE owner_name = ? AND id = ? RETURNING ${COLUMNS}`,
          owner,
          id,
        ),
        alertsOf,
      ).pipe(Effect.map((alerts) => Option.getOrNull(Arr.head(alerts)))),
    markOfflineAlertsRead: (owner, upTo) =>
      Effect.flatMap(
        db.all(
          `UPDATE offline_alerts SET read = ${TRUE[db.dialect]} WHERE owner_name = ? AND id <= ? AND ${isFalse[db.dialect]("read")} RETURNING ${COLUMNS}`,
          owner,
          upTo,
        ),
        alertsOf,
      ).pipe(Effect.map(sortedById)),
    markTriggerAlertsCleared: markedBack(db, "="),
    recordOfflineAlert: ({ agent, offlineReason, owner, raisedAt, trigger }) =>
      Effect.flatMap(
        db.all(
          `INSERT INTO offline_alerts
             (agent_name, owner_name, offline_reason, raised_at, read, trigger_message, trigger_status, trigger_error)
           VALUES (?, ?, ?, ?, ${FALSE[db.dialect]}, ?, ?, ?) RETURNING ${COLUMNS}`,
          agent,
          owner,
          offlineReason,
          raisedAt,
          ...triggerColumns(trigger),
        ),
        alertsOf,
      ).pipe(Effect.flatMap(firstOf)),
  };
}

const OFFLINE_ALERTS_MIGRATION = `CREATE TABLE offline_alerts (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     agent_name TEXT NOT NULL REFERENCES identities (name) ON DELETE CASCADE,
     owner_name TEXT NOT NULL REFERENCES identities (name) ON DELETE CASCADE,
     offline_reason TEXT NOT NULL,
     raised_at TEXT NOT NULL,
     read INTEGER NOT NULL CHECK (read IN (0, 1)),
     back_online_at TEXT
   ) STRICT;
   CREATE INDEX offline_alerts_by_owner ON offline_alerts (owner_name, id);`;

export { type OfflineAlertsSection, OFFLINE_ALERTS_MIGRATION, memoryOfflineAlerts, sqlOfflineAlerts };
