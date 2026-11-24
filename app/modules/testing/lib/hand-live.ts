import type { CookoutEvent, ServerSentEvent } from "../../sdk/index.ts";
import type { LiveAdapter } from "../../live/index.ts";

type Link = "down" | "up";

interface HandLive {
  readonly adapter: LiveAdapter;
  readonly send: (event: CookoutEvent) => void;
  readonly report: (link: Link) => void;
}

function handLive(): HandLive {
  const receivers: ((event: ServerSentEvent) => void)[] = [];
  const reporters: ((link: Link) => void)[] = [];
  return {
    adapter: {
      open: (onEvent, onLink) => {
        receivers.push(onEvent);
        reporters.push(onLink);
      },
    },
    report: (link) => {
      for (const onLink of reporters) {
        onLink(link);
      }
    },
    send: (event) => {
      for (const onEvent of receivers) {
        onEvent({ data: JSON.stringify(event), event: event.type });
      }
    },
  };
}

export { type HandLive, handLive };
