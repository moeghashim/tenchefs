import type { ChannelName, CookoutEvent, MessageId } from "../../sdk/index.ts";
import type { Held, Queues } from "./messages-held.ts";
import type { ReplyRequest, ThreadOps, ThreadsClient } from "./thread-reads.ts";
import { LOADING } from "./message-states.ts";
import type { MessagesHeld } from "./messages-table.ts";
import { createThreadReaders } from "./thread-readers.ts";
import { threadOps } from "./thread-reads.ts";
import { threadWithoutDeleted } from "./message-deletions.ts";

interface ThreadPlace {
  readonly channel: ChannelName;
  readonly id: MessageId;
}

interface ThreadReader {
  readonly listener: () => void;
  readonly acking: boolean;
}

interface Threads {
  readonly show: (place: ThreadPlace, reader: ThreadReader) => () => void;
  readonly reply: (place: ThreadPlace, request: ReplyRequest) => void;
  readonly ack: (place: ThreadPlace, id: MessageId) => void;
  readonly heard: (before: MessagesHeld, event: CookoutEvent) => void;
  readonly back: () => void;
}

interface ThreadsOptions {
  readonly held: Held;
  readonly client: ThreadsClient;
  readonly queues: Queues;
}

type Readers = ReturnType<typeof createThreadReaders>;

interface Opened {
  readonly key: string;
  readonly ops: ThreadOps;
  readonly readers: Readers;
}

type Step = (ops: ThreadOps) => Promise<void>;

interface Threading {
  readonly opened: Map<string, Opened>;
  readonly openedAt: (place: ThreadPlace) => Opened;
  readonly enqueue: (thread: Opened, step: Step) => void;
  readonly options: ThreadsOptions;
}

function threadKey({ channel, id }: ThreadPlace): string {
  return `${channel}/${String(id)}`;
}

function queueKey(thread: Opened): string {
  return `thread/${thread.key}`;
}

function threadingOf(options: ThreadsOptions): Threading {
  const opened = new Map<string, Opened>();
  return {
    enqueue: (thread, step) => {
      options.queues.enqueue(queueKey(thread), async () => {
        await step(thread.ops);
      });
    },
    opened,
    openedAt: (place) => {
      const key = threadKey(place);
      const readers = createThreadReaders();
      const made = opened.get(key) ?? {
        key,
        ops: threadOps({ ...options, ...place, acking: readers.ackingSinceAsked, key }),
        readers,
      };
      opened.set(key, made);
      return made;
    },
    options,
  };
}

function hearing({ enqueue, opened, options }: Threading): Threads["heard"] {
  return (before, event) => {
    if (event.type !== "message" || event.message.kind !== "reply") {
      return;
    }
    const { id } = event.message;
    const after = options.held.current();
    const joined = [...opened.values()].filter(
      (thread) => before.threads.get(thread.key) !== after.threads.get(thread.key) && thread.readers.acking(),
    );
    for (const thread of joined) {
      enqueue(thread, async (ops) => {
        await ops.ack(id);
      });
    }
  };
}

function withoutDeleted({ held }: ThreadsOptions, key: string): void {
  const state = held.current();
  const thread = state.threads.get(key) ?? LOADING;
  if (thread.status !== "loaded") {
    return;
  }
  const kept = threadWithoutDeleted(thread) ?? LOADING;
  if (kept !== thread) {
    held.put({ ...state, threads: new Map(state.threads).set(key, kept) });
  }
}

function showing({ enqueue, openedAt, options }: Threading): Threads["show"] {
  return (place, { acking, listener }) => {
    const thread = openedAt(place);
    const started = options.queues.started(queueKey(thread));
    const reopened = started && !thread.readers.any();
    if (reopened) {
      withoutDeleted(options, thread.key);
    }
    thread.readers.add(listener, acking);
    if (reopened || !started) {
      enqueue(thread, async (ops) => {
        await ops.reload();
      });
    }
    return () => {
      thread.readers.remove(listener);
    };
  };
}

function createThreads(options: ThreadsOptions): Threads {
  const threading = threadingOf(options);
  const { enqueue, openedAt } = threading;
  return {
    ack: (place, id) => {
      enqueue(openedAt(place), async (ops) => {
        await ops.ack(id);
      });
    },
    back: () => {
      for (const thread of threading.opened.values()) {
        if (thread.readers.any()) {
          enqueue(thread, async (ops) => {
            await ops.reload();
          });
        }
      }
    },
    heard: hearing(threading),
    reply: (place, request) => {
      enqueue(openedAt(place), async (ops) => {
        await ops.reply(request);
      });
    },
    show: showing(threading),
  };
}

export { type ThreadPlace, type Threads, createThreads, threadKey };
