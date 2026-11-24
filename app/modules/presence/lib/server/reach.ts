import type { At, BookState, Reach } from "./book.ts";
import { Option } from "effect";
import type { Presence } from "../../index.ts";
import { presenceIn } from "./book.ts";

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

function reachablePresenceIn(at: At): Presence {
  const live = presenceIn(at);
  const reach = Option.fromUndefinedOr(at.state.reach.get(at.identity));
  if (live.online || Option.isNone(reach)) {
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

export { reachKey, reachablePresenceIn, withReach };
