import { Array as Arr, Option } from "effect";
import type { At, BookState, Connection, Reach } from "./book.ts";
import type { LiveConnectionId, Presence } from "../../index.ts";
import { heldAs, heldBy, presenceIn } from "./book.ts";
import type { TriggerResult } from "../../../triggers/index.ts";

type WakeRunSaid = { readonly running: true } | { readonly running: false; readonly failed?: TriggerResult };

interface WakeRunHeard {
  readonly held: boolean;
  readonly streakStarted: boolean;
}

interface Reaching extends At {
  readonly reach: Option.Option<Reach>;
}

function withReach({ identity, reach, state }: Reaching): BookState {
  const next = new Map(state.reach);
  Option.match(reach, {
    onNone: () => next.delete(identity),
    onSome: (kept) => next.set(identity, kept),
  });
  return { ...state, reach: next };
}

function failedResult(reach: Reach): Option.Option<NonNullable<Reach["lastResult"]>> {
  return Option.filter(Option.fromUndefinedOr(reach.lastResult), ({ ok }) => !ok);
}

function runnerWhile(running: boolean): Connection["runner"] {
  if (running) {
    return "waking";
  }
  return "asleep";
}

function withRunResult({ identity, said, state }: At & { readonly said: WakeRunSaid }): BookState {
  if (said.running) {
    return state;
  }
  const failedRuns = new Map(state.failedRuns);
  Option.match(Option.fromUndefinedOr(said.failed), {
    onNone: () => failedRuns.delete(identity),
    onSome: (failed) => failedRuns.set(identity, failed),
  });
  return { ...state, failedRuns };
}

function withWakeRun(at: At & { readonly said: WakeRunSaid }): readonly [WakeRunHeard, BookState] {
  const held = heldBy(at);
  if (!Arr.some([...held.connections.values()], ({ runner }) => runner !== "not a runner")) {
    return [{ held: false, streakStarted: false }, at.state];
  }
  const runner = runnerWhile(at.said.running);
  const connections = new Map(
    Arr.map(
      [...held.connections],
      ([id, connection]: readonly [LiveConnectionId, Connection]) => [id, { ...connection, runner }] as const,
    ),
  );
  const wasFailing = at.state.failedRuns.has(at.identity);
  const state = withRunResult({ ...at, state: heldAs({ ...at, held: { ...held, connections } }) });
  return [{ held: true, streakStarted: !wasFailing && state.failedRuns.has(at.identity) }, state];
}

function isPlainWatched(at: At): boolean {
  return Arr.some([...heldBy(at).connections.values()], ({ runner }) => runner === "not a runner");
}

function isAsleepRunner(at: At): boolean {
  return Arr.some([...heldBy(at).connections.values()], ({ runner }) => runner === "asleep");
}

function heldPresence(at: At, live: Presence): Presence {
  const failedRun = Option.fromUndefinedOr(at.state.failedRuns.get(at.identity));
  if (Option.isSome(failedRun) && !isPlainWatched(at)) {
    return { identity: at.identity, online: false, unreachable: failedRun.value };
  }
  if (isAsleepRunner(at)) {
    return { ...live, wakesOnMention: true };
  }
  return live;
}

function reachablePresenceIn(at: At): Presence {
  const live = presenceIn(at);
  const reach = Option.fromUndefinedOr(at.state.reach.get(at.identity));
  if (live.online) {
    return heldPresence(at, live);
  }
  if (Option.isNone(reach)) {
    return live;
  }
  return Option.match(failedResult(reach.value), {
    onNone: () => ({ identity: at.identity, online: true, wakesOnMention: true }),
    onSome: (unreachable) => ({ ...live, unreachable }),
  });
}

function reachKey(presence: Presence): string {
  const { unreachable, wakesOnMention } = presence;
  return Option.match(Option.fromUndefinedOr(unreachable), {
    onNone: () => String(wakesOnMention === true),
    onSome: ({ at, error = "", status = "" }) => `${at} ${String(status)} ${error}`,
  });
}

export { type WakeRunSaid, reachKey, reachablePresenceIn, withReach, withWakeRun };
