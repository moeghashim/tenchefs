import type { Held, Previews, ScheduleKind, SchedulingOptions, SchedulingSnapshot } from "./scheduling-previews.ts";
import { closedIn, createPreviews, createSaving } from "./scheduling-previews.ts";
import type { ChannelName } from "../../sdk/index.ts";
import type { ScheduledMessage } from "../../scheduled-messages/index.ts";
import { sameSnapshot } from "./selected.ts";
import { timingOf } from "./schedule-timing.ts";

interface Scheduling {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => SchedulingSnapshot;
  readonly open: (channel: ChannelName, text: string) => void;
  readonly openEdit: (schedule: ScheduledMessage) => void;
  readonly close: () => void;
  readonly dismiss: () => void;
  readonly editText: (text: string) => void;
  readonly chooseKind: (kind: ScheduleKind) => void;
  readonly editCron: (cron: string) => void;
  readonly editDate: (date: string) => void;
  readonly editTime: (time: string) => void;
  readonly editTimeZone: (timeZone: string) => void;
  readonly save: (saved: () => void) => void;
}

type Edits = Omit<Scheduling, "subscribe" | "snapshot" | "save">;

function editsOf(held: Held, previews: Previews): Edits {
  const { current, options, publish } = held;
  return {
    chooseKind: (kind) => {
      previews.retimed({ kind });
    },
    close: () => {
      previews.forget();
      publish(closedIn(options.timeZone));
    },
    dismiss: () => {
      publish({ ...current(), scheduled: null });
    },
    editCron: (cron) => {
      previews.retimed({ cron });
    },
    editDate: (date) => {
      previews.retimed({ date });
    },
    editText: (text) => {
      publish({ ...current(), text });
    },
    editTime: (time) => {
      previews.retimed({ time });
    },
    editTimeZone: (timeZone) => {
      previews.retimed({ timeZone });
    },
    open: (channel, text) => {
      previews.forget();
      publish({ ...closedIn(options.timeZone), channel, open: true, text });
    },
    openEdit: (schedule) => {
      previews.forget();
      const { channel, id, text } = schedule;
      publish({ ...closedIn(options.timeZone), channel, editing: id, open: true, text });
      previews.retimed(timingOf(schedule));
    },
  };
}

function createScheduling(options: SchedulingOptions): Scheduling {
  const listeners = new Set<() => void>();
  let current = closedIn(options.timeZone);
  const held: Held = {
    current: () => current,
    options,
    publish: (next) => {
      if (sameSnapshot({ after: next, before: current })) {
        return;
      }
      current = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
  return {
    ...editsOf(held, createPreviews(held)),
    save: createSaving(held),
    snapshot: held.current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type { ScheduleKind, SchedulingSnapshot } from "./scheduling-previews.ts";
export { type Scheduling, createScheduling };
