import type { ChannelName, IsoTime, Refusal } from "../../sdk/index.ts";
import type {
  CreateScheduledMessageRequest,
  PreviewScheduledMessageQuery,
  ScheduledMessage,
} from "../../scheduled-messages/index.ts";
import type { Clock } from "../../format/index.ts";
import { refusalOf } from "../../sdk/index.ts";

type ScheduleKind = "once" | "recurring";

type PreviewState =
  | { readonly status: "waiting" }
  | { readonly status: "checking" }
  | { readonly status: "shown"; readonly runs: readonly IsoTime[] }
  | (Refusal & { readonly status: "refused" });

type ScheduleSaveState =
  | { readonly status: "idle" }
  | { readonly status: "saving" }
  | (Refusal & { readonly status: "failed" });

interface SchedulingSnapshot {
  readonly open: boolean;
  readonly channel: ChannelName | null;
  readonly text: string;
  readonly kind: ScheduleKind;
  readonly cron: string;
  readonly date: string;
  readonly time: string;
  readonly timeZone: string;
  readonly preview: PreviewState;
  readonly save: ScheduleSaveState;
  readonly scheduled: ScheduledMessage | null;
}

interface SchedulingOptions {
  readonly create: (request: CreateScheduledMessageRequest) => Promise<ScheduledMessage>;
  readonly preview: (query: PreviewScheduledMessageQuery) => Promise<readonly IsoTime[]>;
  readonly clock: Clock;
  readonly pause: number;
  readonly timeZone: string;
}

type Timing = Pick<SchedulingSnapshot, "kind" | "cron" | "date" | "time" | "timeZone">;

interface Held {
  readonly options: SchedulingOptions;
  readonly current: () => SchedulingSnapshot;
  readonly publish: (next: SchedulingSnapshot) => void;
}

interface Previews {
  readonly retimed: (timing: Partial<Timing>) => void;
  readonly forget: () => void;
}

const WAITING: PreviewState = { status: "waiting" };
const IDLE: ScheduleSaveState = { status: "idle" };
const ONE = 1;

function closedIn(timeZone: string): SchedulingSnapshot {
  return {
    channel: null,
    cron: "",
    date: "",
    kind: "once",
    open: false,
    preview: WAITING,
    save: IDLE,
    scheduled: null,
    text: "",
    time: "",
    timeZone,
  };
}

function queryOf(timing: Timing): PreviewScheduledMessageQuery | null {
  const timeZone = timing.timeZone.trim();
  if (timing.kind === "recurring") {
    const cron = timing.cron.trim();
    if (cron === "") {
      return null;
    }
    return { cron, timeZone };
  }
  if (timing.date === "" || timing.time === "") {
    return null;
  }
  return { at: `${timing.date}T${timing.time}`, timeZone };
}

function requestOf(snapshot: SchedulingSnapshot): CreateScheduledMessageRequest | null {
  const query = queryOf(snapshot);
  if (query === null || snapshot.channel === null) {
    return null;
  }
  return { ...query, channel: snapshot.channel, text: snapshot.text };
}

async function after(previous: Promise<void>, step: () => Promise<void>): Promise<void> {
  await previous;
  await step();
}

function createPreviews(held: Held): Previews {
  const { current, options, publish } = held;
  let asked = 0;
  let stopWaiting: (() => void) | null = null;
  let answering = Promise.resolve();

  async function answer(query: PreviewScheduledMessageQuery, ask: number): Promise<void> {
    try {
      const runs = await options.preview(query);
      if (ask === asked) {
        publish({ ...current(), preview: { runs, status: "shown" } });
      }
    } catch (error: unknown) {
      if (ask === asked) {
        publish({ ...current(), preview: { ...refusalOf(error), status: "refused" } });
      }
    }
  }

  function forget(): number {
    if (stopWaiting !== null) {
      stopWaiting();
    }
    asked += ONE;
    return asked;
  }

  return {
    forget: () => {
      forget();
    },
    retimed: (timing) => {
      const next = { ...current(), ...timing, save: IDLE };
      const query = queryOf(next);
      const ask = forget();
      if (query === null) {
        publish({ ...next, preview: WAITING });
        return;
      }
      publish({ ...next, preview: { status: "checking" } });
      stopWaiting = options.clock.after(options.pause, () => {
        answering = after(answering, async () => {
          await answer(query, ask);
        });
      });
    },
  };
}

function createSaving(held: Held): (saved: () => void) => void {
  const { current, options, publish } = held;
  let sending = Promise.resolve();

  async function send(request: CreateScheduledMessageRequest, saved: () => void): Promise<void> {
    try {
      const scheduled = await options.create(request);
      publish({ ...closedIn(options.timeZone), scheduled });
      saved();
    } catch (error: unknown) {
      publish({ ...current(), save: { ...refusalOf(error), status: "failed" } });
    }
  }

  return (saved) => {
    const request = requestOf(current());
    if (request === null) {
      return;
    }
    publish({ ...current(), save: { status: "saving" } });
    sending = after(sending, async () => {
      await send(request, saved);
    });
  };
}

export {
  type Held,
  type Previews,
  type ScheduleKind,
  type SchedulingOptions,
  type SchedulingSnapshot,
  closedIn,
  createPreviews,
  createSaving,
};
