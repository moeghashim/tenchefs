type Published = () => void;
type Call = (...args: readonly unknown[]) => unknown;

function callable(value: unknown): Call | null {
  if (typeof value !== "function") {
    return null;
  }
  return (...args) => {
    const result: unknown = Reflect.apply(value, null, args);
    return result;
  };
}

function cached(made: WeakMap<object, Call>, key: object, make: () => Call): Call {
  const found = made.get(key) ?? make();
  made.set(key, found);
  return found;
}

function counted(published: Published, listener: Call): Call {
  return (...args) => {
    published();
    return listener(...args);
  };
}

function probedSubscribe(published: Published, subscribe: Call): Call {
  const listeners = new WeakMap<object, Call>();
  const subscribers = new WeakMap<object, Call>();
  return (...args) => {
    const [first, ...rest] = args;
    const listener = callable(first);
    if (typeof first === "function" && listener !== null) {
      return subscribe(
        cached(listeners, first, () => counted(published, listener)),
        ...rest,
      );
    }
    const made = subscribe(...args);
    const subscriber = callable(made);
    if (typeof made !== "function" || subscriber === null) {
      return made;
    }
    return cached(subscribers, made, () => probedSubscribe(published, subscriber));
  };
}

function isPlainObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function probeOwn(store: object, published: Published): readonly object[] {
  const nested: object[] = [];
  for (const key of Object.keys(store)) {
    const value: unknown = Reflect.get(store, key);
    const subscribe = callable(value);
    if (subscribe !== null && key.startsWith("subscribe")) {
      Reflect.set(store, key, probedSubscribe(published, subscribe));
    }
    if (isPlainObject(value)) {
      nested.push(value);
    }
  }
  return nested;
}

function publishedOnce(publishes: (store: string) => void, store: string): Published {
  let publishing = false;
  return () => {
    if (publishing) {
      return;
    }
    publishing = true;
    publishes(store);
    queueMicrotask(() => {
      publishing = false;
    });
  };
}

interface Probing {
  readonly stores: object;
  readonly published: (store: string) => void;
}

function treeProber(): (root: unknown, published: Published) => void {
  const seen = new WeakSet<object>();
  return (root, published) => {
    const left = [root].filter((value) => isPlainObject(value));
    for (const next of left) {
      if (!seen.has(next)) {
        seen.add(next);
        left.push(...probeOwn(next, published));
      }
    }
  };
}

function probeStores({ published, stores }: Probing): void {
  const probeTree = treeProber();
  for (const name of Object.keys(stores)) {
    probeTree(Reflect.get(stores, name), publishedOnce(published, name));
  }
}

export { probeStores };
