import type { CookoutEvent } from "../../sdk/index.ts";

const NONE = 0;
const ONE = 1;

interface Slice<State, Client> {
  readonly empty: State;
  readonly read: (client: Client) => Promise<State | null>;
  readonly apply: (state: State, event: CookoutEvent) => State;
}

interface Part<State> {
  readonly state: () => State;
  readonly apply: (event: CookoutEvent) => void;
  readonly show: () => void;
  readonly hide: () => void;
  readonly back: () => void;
}

interface PartOptions<State, Client> {
  readonly slice: Slice<State, Client>;
  readonly client: Client;
  readonly changed: () => void;
}

interface Reader {
  readonly read: () => Promise<void>;
  readonly heard: (event: CookoutEvent) => void;
}

interface ReaderOptions<State, Client> extends Omit<PartOptions<State, Client>, "changed"> {
  readonly put: (loaded: State) => void;
}

function readerOf<State, Client>({ client, put, slice }: ReaderOptions<State, Client>): Reader {
  const heardWhileReading = new Set<CookoutEvent[]>();
  return {
    heard: (event) => {
      for (const heard of heardWhileReading) {
        heard.push(event);
      }
    },
    read: async () => {
      const heard: CookoutEvent[] = [];
      heardWhileReading.add(heard);
      const loaded: State | null = await slice.read(client).catch(() => null);
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

function createPart<State, Client>(options: PartOptions<State, Client>): Part<State> {
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

  const { heard, read } = readerOf({ client: options.client, put, slice });

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
    show: () => {
      readers += ONE;
      reading ??= read();
    },
    state: () => state,
  };
}

export { type Part, type Slice, createPart };
