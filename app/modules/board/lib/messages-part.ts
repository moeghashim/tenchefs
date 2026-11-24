import type { ChannelPages, PagesOptions } from "./channel-pages.ts";
import type { CookoutClient, CookoutEvent, MessageId, TopLevelMessage } from "../../sdk/index.ts";
import type { Held, Queues } from "./messages-held.ts";
import type { ThreadPlace, Threads } from "./threads-part.ts";
import { createHeld, createQueues, readersOf } from "./messages-held.ts";
import { withEntry, withFresh } from "./messages-table.ts";
import type { MessagesHeld } from "./messages-table.ts";
import type { ThreadsClient } from "./thread-reads.ts";
import { createChannelPages } from "./channel-pages.ts";
import { createThreads } from "./threads-part.ts";
import { failure } from "./failure.ts";

const ONE = 1;
const NONE = 0;
const FIRST = 0;

type MessagesClient = PagesOptions["client"] & ThreadsClient & Pick<CookoutClient, "listMessages">;

interface MessagesPart {
  readonly state: () => MessagesHeld;
  readonly pages: ChannelPages;
  readonly threads: Threads;
  readonly showBefore: (place: ThreadPlace) => () => void;
  readonly apply: (event: CookoutEvent) => void;
  readonly back: () => void;
}

interface MessagesOptions {
  readonly client: MessagesClient;
  readonly pageSize: number;
  readonly changed: () => void;
}

interface BeforeReading {
  readonly held: Held;
  readonly client: MessagesClient;
  readonly place: ThreadPlace;
}

function beforeKey({ channel, id }: ThreadPlace): string {
  return `${channel}/${String(id)}`;
}

function firstId(messages: readonly TopLevelMessage[]): MessageId | null {
  return messages.map((message) => message.id).at(FIRST) ?? null;
}

async function readBefore({ client, held, place }: BeforeReading): Promise<void> {
  const key = beforeKey(place);
  try {
    await held.readInto({
      change: (current, read) => {
        const value = { id: firstId(read.messages), status: "loaded" } as const;
        return { ...withFresh({ fresh: read, held: current }), before: withEntry({ key, map: current.before, value }) };
      },
      request: async () => {
        const read = await client.listMessages(place.channel, { before: place.id, limit: ONE });
        return read;
      },
    });
  } catch (error: unknown) {
    const current = held.current();
    held.put({ ...current, before: withEntry({ key, map: current.before, value: failure(error) }) });
  }
}

interface Before {
  readonly show: (place: ThreadPlace) => () => void;
  readonly back: () => void;
}

function beforePart(reading: Omit<BeforeReading, "place">, queues: Queues): Before {
  const readers = new Map<string, number>();
  const places = new Map<string, ThreadPlace>();
  function read(place: ThreadPlace): void {
    queues.enqueue(`before/${beforeKey(place)}`, async () => {
      await readBefore({ ...reading, place });
    });
  }
  return {
    back: () => {
      for (const [key, place] of places) {
        if (readersOf({ key, readers }) > NONE) {
          read(place);
        }
      }
    },
    show: (place) => {
      const key = beforeKey(place);
      if (!places.has(key)) {
        places.set(key, place);
        read(place);
      }
      readers.set(key, readersOf({ key, readers }) + ONE);
      return () => {
        readers.set(key, readersOf({ key, readers }) - ONE);
      };
    },
  };
}

function createMessagesPart({ changed, client, pageSize }: MessagesOptions): MessagesPart {
  const held = createHeld(changed);
  const queues = createQueues();
  const pages = createChannelPages({ client, held, pageSize, queues });
  const threads = createThreads({ client, held, queues });
  const before = beforePart({ client, held }, queues);
  return {
    apply: (event) => {
      const heldBefore = held.current();
      held.heard(event);
      pages.heard(heldBefore, event);
      threads.heard(heldBefore, event);
    },
    back: () => {
      pages.back();
      threads.back();
      before.back();
    },
    pages,
    showBefore: before.show,
    state: held.current,
    threads,
  };
}

export { type MessagesClient, type MessagesPart, beforeKey, createMessagesPart };
