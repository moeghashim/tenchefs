type Subscribe = (listener: () => void) => () => void;

interface Listeners {
  readonly subscribe: Subscribe;
  readonly notify: () => void;
}

function createListeners(): Listeners {
  const listeners = new Set<() => void>();
  return {
    notify: () => {
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

export { createListeners };
