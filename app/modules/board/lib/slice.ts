import type { CookoutEvent } from "../../sdk/index.ts";

const NONE = 0;
const ONE = 1;

interface Slice<State, Client, Change = CookoutEvent> {
  readonly empty: State;
  readonly read: (client: Client, held: State) => Promise<State | null>;
  readonly apply: (state: State, event: Change) => State;
}

interface Part<State, Change = CookoutEvent> {
  readonly state: () => State;
  readonly apply: (event: Change) => void;
  readonly show: () => void;
  readonly hide: () => void;
  readonly back: () => void;
  readonly settled: () => Promise<void>;
}

interface PartOptions<State, Client, Change> {
  readonly slice: Slice<State, Client, Change>;
  readonly client: Client;
  readonly changed: () => void;
}

interface Reader<Change> {
  readonly read: () => Promise<void>;
  readonly heard: (event: Change) => void;
}

interface ReaderOptions<State, Client, Change> extends Omit<PartOptions<State, Client, Change>, "changed"> {
  readonly put: (loaded: State) => void;
  readonly held: () => State;
}

function readerOf<State, Client, Change>({
  client,
  held,
  put,
  slice,
}: ReaderOptions<State, Client, Change>): Reader<Change> {
  const heardWhileReading = new Set<Change[]>();
  return {
    heard: (event) => {
      for (const heard of heardWhileReading) {
        heard.push(event);
      }
    },
    read: async () => {
      const heard: Change[] = [];
      heardWhileReading.add(heard);
      const loaded: State | null = await slice.read(client, held()).catch(() => null);
      heardWhileReading.delete(heard);
      if (loaded === null) {
        return;
      }
      let next: State = loaded;
      for (const event of heard) {
        next = slice.apply(next, event);
      }
      put(next);
    },
  };
}

function createPart<State, Client, Change = CookoutEvent>(
  options: PartOptions<State, Client, Change>,
): Part<State, Change> {
  const { slice } = options;
  let state = slice.empty;
  let readers = NONE;
  let reading: Promise<void> | null = null;

  function put(next: State): void {
    if (next !== state) {
      state = next;
      options.changed();
    }
  }

  const { heard, read } = readerOf({ client: options.client, held: () => state, put, slice });

  return {
    apply: (event) => {
      heard(event);
      put(slice.apply(state, event));
    },
    back: () => {
      reading = null;
      if (readers > NONE) {
        reading = read();
      }
    },
    hide: () => {
      readers -= ONE;
    },
    settled: async () => {
      await reading;
    },
    show: () => {
      readers += ONE;
      reading ??= read();
    },
    state: () => state,
  };
}

export { type Part, type Slice, createPart };
