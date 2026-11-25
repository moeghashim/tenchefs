import type { CookoutEvent, IdentityName, Trigger } from "../../sdk/index.ts";
import type { Part } from "./slice.ts";

const NONE = 0;

type CalledTriggers = ReadonlyMap<IdentityName, Trigger>;

interface Called {
  readonly triggers: CalledTriggers;
}

function applied(triggers: CalledTriggers, event: CookoutEvent): CalledTriggers {
  if (event.type !== "trigger") {
    return triggers;
  }
  return new Map(triggers).set(event.identity, event.trigger);
}

type CalledPart = Pick<Part<CalledTriggers>, "apply" | "back" | "state">;

function createCalledTriggers(changed: () => void): CalledPart {
  let state: CalledTriggers = new Map();
  return {
    apply: (event) => {
      const next = applied(state, event);
      if (next !== state) {
        state = next;
        changed();
      }
    },
    back: () => {
      if (state.size > NONE) {
        state = new Map();
        changed();
      }
    },
    state: () => state,
  };
}

function calledTrigger(agent: IdentityName): (state: Called) => Trigger | null {
  function calledIn(state: Called): Trigger | null {
    return state.triggers.get(agent) ?? null;
  }
  return calledIn;
}

export { type CalledPart, type CalledTriggers, calledTrigger, createCalledTriggers };
