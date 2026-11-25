import type { CookoutClient, EventStream, ServerSentEvent } from "../../sdk/index.ts";
import type { Live } from "../../live/index.ts";
import { createLive } from "../../live/index.ts";
import { watchAdapter } from "./watch.ts";

type LiveLink = ReturnType<Live["link"]>;

interface ScriptedLive {
  readonly live: Live;
  readonly send: (...events: readonly ServerSentEvent[]) => void;
  readonly report: (link: LiveLink) => void;
}

interface WatchedLive {
  readonly live: Live;
  readonly stream: Promise<EventStream>;
}

function scriptedLive(): ScriptedLive {
  const receivers: ((event: ServerSentEvent) => void)[] = [];
  const reporters: ((link: LiveLink) => void)[] = [];
  const live = createLive({
    open: (onEvent, onLink) => {
      receivers.push(onEvent);
      reporters.push(onLink);
    },
  });
  return {
    live,
    report: (link) => {
      for (const onLink of reporters) {
        onLink(link);
      }
    },
    send: (...events) => {
      for (const onEvent of receivers) {
        for (const event of events) {
          onEvent(event);
        }
      }
    },
  };
}

function watchedLive(client: Pick<CookoutClient, "watch">): WatchedLive {
  const { promise, resolve } = Promise.withResolvers<EventStream>();
  const live = createLive(
    watchAdapter({
      watch: async (options) => {
        const stream = await client.watch(options);
        resolve(stream);
        return stream;
      },
    }),
  );
  return { live, stream: promise };
}

export type { Live } from "../../live/index.ts";
export { type LiveLink, type ScriptedLive, type WatchedLive, scriptedLive, watchedLive };
