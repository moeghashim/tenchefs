interface Listeners {
  readonly add: (listener: () => void) => () => void;
  readonly notify: () => void;
}

function listenersOf(show: () => () => void): Listeners {
  const listeners = new Set<() => void>();
  return {
    add: (listener) => {
      listeners.add(listener);
      const hide = show();
      return () => {
        listeners.delete(listener);
        hide();
      };
    },
    notify: () => {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

export { listenersOf };
