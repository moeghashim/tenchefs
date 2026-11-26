import { configure, getConfig } from "@testing-library/react";
import { onTestFinished } from "vitest";

interface CallsInFlight {
  readonly track: <Client extends object>(client: Client) => Client;
  readonly settled: () => Promise<void>;
  readonly holdOpen: (names: readonly string[]) => void;
}

interface Stalling {
  readonly stallMs: number;
}

interface Registry {
  readonly add: (name: string) => () => void;
  readonly count: () => number;
  readonly names: () => readonly string[];
  readonly changed: (wake: () => void) => () => void;
  readonly hold: (names: readonly string[]) => void;
  readonly holdsAll: () => boolean;
  readonly holds: (name: string) => boolean;
}

interface Call {
  readonly name: string;
}

const QUIET_TURNS = 3;
const STALL_MS = 4000;
const NONE = 0;
const ONE = 1;
const realTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

async function turn(): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  realTimeout(() => {
    resolve(true);
  }, NONE);
  const turned = await promise;
  return turned;
}

function stalled({ names, stallMs }: Stalling & { readonly names: readonly string[] }): Error {
  return new Error(
    `calls still in flight after ${String(stallMs)} ms before a read of the screen: ${names.join(", ")}. A test that holds a call open on purpose names it first: holdsCallsOpen("${names.join('", "')}") from app/modules/testing/web.ts.`,
  );
}

function createHolds(): Pick<Registry, "hold" | "holds" | "holdsAll"> {
  const held = new Set<string>();
  const every = { held: false };
  return {
    hold: (names) => {
      every.held ||= names.length === NONE;
      for (const name of names) {
        held.add(name);
      }
      onTestFinished(() => {
        every.held = false;
        held.clear();
      });
    },
    holds: (name) => every.held || held.has(name),
    holdsAll: () => every.held,
  };
}

function createRegistry(): Registry {
  const inFlight = new Set<Call>();
  const waiting = new Set<() => void>();
  const holds = createHolds();
  function wakeAll(): void {
    for (const wake of waiting) {
      wake();
    }
  }
  function forget(call: Call): void {
    inFlight.delete(call);
    wakeAll();
  }
  return {
    ...holds,
    add: (name) => {
      const call: Call = { name };
      inFlight.add(call);
      onTestFinished(() => {
        inFlight.delete(call);
      });
      return () => {
        forget(call);
      };
    },
    changed: (wake) => {
      waiting.add(wake);
      return () => {
        waiting.delete(wake);
      };
    },
    count: () => [...inFlight].filter((call) => !holds.holds(call.name)).length,
    hold: (names) => {
      holds.hold(names);
      wakeAll();
    },
    names: () => [...inFlight].filter((call) => !holds.holds(call.name)).map((call) => call.name),
  };
}

async function counted(registry: Registry, name: string, answer: Promise<unknown>): Promise<unknown> {
  const forget = registry.add(name);
  try {
    const answered: unknown = await answer;
    return answered;
  } finally {
    forget();
  }
}

async function oneSettles(registry: Registry, stallMs: number): Promise<void> {
  const { promise, reject, resolve } = Promise.withResolvers<boolean>();
  const names = registry.names();
  const timer = realTimeout(() => {
    reject(stalled({ names, stallMs }));
  }, stallMs);
  const stop = registry.changed(() => {
    resolve(true);
  });
  try {
    await promise;
  } finally {
    stop();
    realClearTimeout(timer);
  }
}

async function quiet(registry: Registry, turns: number): Promise<boolean> {
  if (turns === NONE) {
    return true;
  }
  await turn();
  if (registry.count() > NONE) {
    return false;
  }
  const still = await quiet(registry, turns - ONE);
  return still;
}

async function settledFor(registry: Registry, stallMs: number): Promise<void> {
  if (registry.holdsAll()) {
    return;
  }
  if (registry.count() > NONE) {
    await oneSettles(registry, stallMs);
  } else if (await quiet(registry, QUIET_TURNS)) {
    return;
  }
  await settledFor(registry, stallMs);
}

function trackFor<Client extends object>(registry: Registry, client: Client): Client {
  return new Proxy(client, {
    get: (target, key): unknown => {
      const value: unknown = Reflect.get(target, key);
      if (typeof value !== "function") {
        return value;
      }
      return (...args: readonly unknown[]): unknown => {
        const answer: unknown = Reflect.apply(value, target, args);
        if (answer instanceof Promise) {
          return counted(registry, String(key), answer);
        }
        return answer;
      };
    },
  });
}

function createCallsInFlight({ stallMs }: Stalling): CallsInFlight {
  const registry = createRegistry();
  return {
    holdOpen: registry.hold,
    settled: async () => {
      await settledFor(registry, stallMs);
    },
    track: (client) => trackFor(registry, client),
  };
}

const environments = new WeakMap<typeof globalThis, CallsInFlight>();

function installed(): CallsInFlight {
  const calls = createCallsInFlight({ stallMs: STALL_MS });
  const before = { ...getConfig() };
  configure({
    asyncWrapper: async (read) => {
      const answer: unknown = await before.asyncWrapper(async () => {
        await calls.settled();
        const result: unknown = await read();
        return result;
      });
      return answer;
    },
  });
  environments.set(globalThis, calls);
  return calls;
}

function callsInFlight(): CallsInFlight {
  return environments.get(globalThis) ?? installed();
}

function trackedCalls<Client extends object>(client: Client): Client {
  return callsInFlight().track(client);
}

function holdsCallsOpen(...names: readonly string[]): void {
  callsInFlight().holdOpen(names);
}

async function settledCalls(): Promise<void> {
  await callsInFlight().settled();
}

export { type CallsInFlight, createCallsInFlight, holdsCallsOpen, settledCalls, trackedCalls };
