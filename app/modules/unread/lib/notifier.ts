import { sameSnapshot } from "../../board/index.ts";

interface Notifier<State> {
  readonly current: () => State;
  readonly publish: (state: State) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

function createNotifier<State extends object>(initial: State): Notifier<State> {
  const listeners = new Set<() => void>();
  let current = initial;
  return {
    current: () => current,
    publish: (state) => {
      if (sameSnapshot({ after: state, before: current })) {
        return;
      }
      current = state;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export { type Notifier, createNotifier };
