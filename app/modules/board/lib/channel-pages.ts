import type { ChannelName, CookoutEvent, MessageId } from "../../sdk/index.ts";
import type { Held, Queues } from "./messages-held.ts";
import type { PageOps, PagesClient } from "./page-reads.ts";
import type { CallRequest } from "./command-call.ts";
import type { MessagesHeld } from "./messages-table.ts";
import type { PostRequest } from "./page-calls.ts";
import { pageCalls } from "./page-calls.ts";
import { pageOps } from "./page-reads.ts";
import { readersOf } from "./messages-held.ts";

const NONE = 0;
const ONE = 1;

interface ShownClosed {
  readonly run: readonly MessageId[];
  readonly count: number;
}

interface ChannelPages {
  readonly show: (name: ChannelName) => () => void;
  readonly post: (name: ChannelName, request: PostRequest) => void;
  readonly call: (name: ChannelName, request: CallRequest) => void;
  readonly editCallData: (name: ChannelName, data: string) => void;
  readonly loadOlder: (name: ChannelName) => void;
  readonly showClosed: (name: ChannelName, shown: ShownClosed) => void;
  readonly heard: (before: MessagesHeld, event: CookoutEvent) => void;
  readonly back: () => void;
}

interface PagesOptions {
  readonly held: Held;
  readonly client: PagesClient;
  readonly pageSize: number;
  readonly queues: Queues;
}

type Step = (ops: PageOps) => Promise<void>;

interface Paging {
  readonly options: PagesOptions;
  readonly readers: Map<ChannelName, number>;
  readonly ops: (name: ChannelName) => PageOps;
  readonly enqueue: (name: ChannelName, step: Step) => void;
  readonly open: (name: ChannelName) => boolean;
}

function keyOf(name: ChannelName): string {
  return `page/${name}`;
}

function pagingOf(options: PagesOptions): Paging {
  const readers = new Map<ChannelName, number>();
  function ops(name: ChannelName): PageOps {
    return pageOps({ ...options, name });
  }
  return {
    enqueue: (name, step) => {
      options.queues.enqueue(keyOf(name), async () => {
        await step(ops(name));
      });
    },
    open: (name) => readersOf({ key: name, readers }) > NONE,
    ops,
    options,
    readers,
  };
}

function showing(paging: Paging): ChannelPages["show"] {
  const { enqueue, open, readers } = paging;
  return (name) => {
    const started = paging.options.queues.started(keyOf(name));
    if (!open(name) && started) {
      enqueue(name, async (ops) => {
        await ops.reloadNewest();
      });
    }
    readers.set(name, readersOf({ key: name, readers }) + ONE);
    if (!started) {
      enqueue(name, async (ops) => {
        await ops.loadNewest();
      });
    }
    return () => {
      readers.set(name, readersOf({ key: name, readers }) - ONE);
    };
  };
}

function hearing(paging: Paging): ChannelPages["heard"] {
  return (before, event) => {
    if (event.type !== "message" || event.message.kind !== "top-level") {
      return;
    }
    const { channel, id } = event.message;
    const changed = before.pages.get(channel) !== paging.options.held.current().pages.get(channel);
    if (changed && paging.open(channel)) {
      paging.enqueue(channel, async (ops) => {
        await ops.ack(id);
      });
    }
  };
}

function backAgain(paging: Paging): ChannelPages["back"] {
  return () => {
    for (const name of paging.readers.keys()) {
      if (paging.open(name)) {
        paging.enqueue(name, async (ops) => {
          await ops.reloadNewest();
        });
      }
    }
  };
}

function calling(paging: Paging): Pick<ChannelPages, "call" | "post"> {
  const { enqueue, options } = paging;
  return {
    call: (name, request) => {
      enqueue(name, async (ops) => {
        await pageCalls({ at: { ...options, name }, ops }).call(request);
      });
    },
    post: (name, request) => {
      enqueue(name, async (ops) => {
        await pageCalls({ at: { ...options, name }, ops }).post(request);
      });
    },
  };
}

function createChannelPages(options: PagesOptions): ChannelPages {
  const paging = pagingOf(options);
  return {
    ...calling(paging),
    back: backAgain(paging),
    editCallData: (name, callData) => {
      paging.ops(name).update((page) => ({ ...page, callData }));
    },
    heard: hearing(paging),
    loadOlder: (name) => {
      paging.enqueue(name, async (ops) => {
        await ops.loadOlder();
      });
    },
    show: showing(paging),
    showClosed: (name, { count, run }) => {
      paging.ops(name).update((page) => {
        const expanded = new Map(page.expanded);
        for (const id of run) {
          expanded.set(id, count);
        }
        return { ...page, expanded };
      });
    },
  };
}

export { type ChannelPages, type PagesOptions, createChannelPages };
