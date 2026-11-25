import { expect, onTestFinished } from "vitest";

interface ExternalStore<Snapshot> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => Snapshot;
}

interface Publishes {
  readonly count: () => number;
}

interface Publish<Snapshot> {
  readonly before: Snapshot;
  readonly after: Snapshot;
}

function recordPublishes<Snapshot>(store: ExternalStore<Snapshot>): Publishes {
  let before = store.snapshot();
  const published: Publish<Snapshot>[] = [];
  const unsubscribe = store.subscribe(() => {
    const after = store.snapshot();
    published.push({ after, before });
    before = after;
  });
  onTestFinished(() => {
    unsubscribe();
    for (const [index, publish] of published.entries()) {
      expect(
        publish.after,
        `publish ${String(index)} (counting from 0) of ${String(published.length)} left the snapshot deep-equal to the one before`,
      ).not.toStrictEqual(publish.before);
    }
  });
  return { count: () => published.length };
}

export { type ExternalStore, type Publishes, recordPublishes };
