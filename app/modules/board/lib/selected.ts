type Subscribe = (listener: () => void) => () => void;

interface SelectedStore<State> {
  readonly subscribe: Subscribe;
  readonly snapshot: () => State;
}

function selectedStore<State>({ snapshot, subscribe }: SelectedStore<State>): SelectedStore<State> {
  return {
    snapshot,
    subscribe: (listener) => {
      let last = snapshot();
      return subscribe(() => {
        const next = snapshot();
        if (!Object.is(next, last)) {
          last = next;
          listener();
        }
      });
    },
  };
}

function sameField(before: unknown, after: unknown): boolean {
  if (Array.isArray(before) && Array.isArray(after)) {
    return before.length === after.length && before.every((each, index) => Object.is(each, after[index]));
  }
  return Object.is(before, after);
}

interface Snapshots {
  readonly before: object;
  readonly after: object;
}

function sameSnapshot({ after, before }: Snapshots): boolean {
  const keys = Object.keys(after);
  return (
    keys.length === Object.keys(before).length &&
    keys.every((key) => sameField(Reflect.get(before, key), Reflect.get(after, key)))
  );
}

export { sameSnapshot, selectedStore };
