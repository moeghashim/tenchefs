interface Tally {
  readonly add: (key: string) => void;
  readonly total: () => number;
  readonly text: () => string;
}

const NONE = 0;
const ONE = 1;

function byCount([leftKey, left]: readonly [string, number], [rightKey, right]: readonly [string, number]): number {
  if (left === right) {
    return leftKey.localeCompare(rightKey);
  }
  return right - left;
}

function createTally(): Tally {
  const counts = new Map<string, number>();
  let total = NONE;
  return {
    add: (key) => {
      counts.set(key, (counts.get(key) ?? NONE) + ONE);
      total += ONE;
    },
    text: () =>
      [...counts]
        .toSorted(byCount)
        .map(([key, count]: readonly [string, number]) => `${key} ${String(count)}`)
        .join(", "),
    total: () => total,
  };
}

export { type Tally, createTally };
