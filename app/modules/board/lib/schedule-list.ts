import type { ChannelName, Refusal } from "../../sdk/index.ts";
import type { ScheduleChange } from "./board-calls.ts";
import type { ScheduledMessageId } from "../../scheduled-messages/index.ts";
import { refusalOf } from "../../sdk/index.ts";
import { sameSnapshot } from "./selected.ts";

type ScheduleChangeState =
  | { readonly status: "idle" }
  | { readonly status: "changing"; readonly id: ScheduledMessageId }
  | (Refusal & { readonly status: "failed"; readonly id: ScheduledMessageId });

type ScheduleControl = "toggle" | "edit";

interface ScheduleFocus {
  readonly id: ScheduledMessageId;
  readonly control: ScheduleControl;
}

interface ScheduleListState {
  readonly channel: ChannelName | null;
  readonly returnTo: ScheduleFocus | null;
  readonly selected: ScheduledMessageId | null;
  readonly deleting: ScheduledMessageId | null;
  readonly change: ScheduleChangeState;
}

interface ScheduleList {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => ScheduleListState;
  readonly open: (channel: ChannelName, selected: ScheduledMessageId | null) => void;
  readonly close: () => void;
  readonly returnToEdit: (id: ScheduledMessageId | null) => void;
  readonly askDelete: (id: ScheduledMessageId) => void;
  readonly cancelDelete: () => void;
  readonly change: (id: ScheduledMessageId, change: ScheduleChange) => void;
}

interface ScheduleListOptions {
  readonly change: (id: ScheduledMessageId, change: ScheduleChange) => Promise<void>;
}

const IDLE: ScheduleChangeState = { status: "idle" };
const CLOSED: ScheduleListState = { change: IDLE, channel: null, deleting: null, returnTo: null, selected: null };

async function after(previous: Promise<void>, step: () => Promise<void>): Promise<void> {
  await previous;
  await step();
}

function toggleFocus(id: ScheduledMessageId, change: ScheduleChange): ScheduleFocus | null {
  if (change === "remove") {
    return null;
  }
  return { control: "toggle", id };
}

function editFocus(id: ScheduledMessageId | null): ScheduleFocus | null {
  if (id === null) {
    return null;
  }
  return { control: "edit", id };
}

interface Changing {
  readonly current: () => ScheduleListState;
  readonly options: ScheduleListOptions;
  readonly publish: (next: ScheduleListState) => void;
}

function changingIn({
  current,
  options,
  publish,
}: Changing): (id: ScheduledMessageId, change: ScheduleChange) => Promise<void> {
  return async (id, change) => {
    publish({ ...current(), change: { id, status: "changing" }, returnTo: null });
    try {
      await options.change(id, change);
      publish({ ...current(), change: IDLE, deleting: null, returnTo: toggleFocus(id, change) });
    } catch (error: unknown) {
      publish({
        ...current(),
        change: { ...refusalOf(error), id, status: "failed" },
        returnTo: toggleFocus(id, change),
      });
    }
  };
}

function createScheduleList(options: ScheduleListOptions): ScheduleList {
  const listeners = new Set<() => void>();
  let current = CLOSED;
  let changes = Promise.resolve();
  function publish(next: ScheduleListState): void {
    if (sameSnapshot({ after: next, before: current })) {
      return;
    }
    current = next;
    for (const listener of listeners) {
      listener();
    }
  }
  const changing = changingIn({ current: () => current, options, publish });
  return {
    askDelete: (id) => {
      publish({ ...current, change: IDLE, deleting: id });
    },
    cancelDelete: () => {
      publish({ ...current, change: IDLE, deleting: null });
    },
    change: (id, change) => {
      changes = after(changes, async () => {
        await changing(id, change);
      });
    },
    close: () => {
      publish(CLOSED);
    },
    open: (channel, selected) => {
      publish({ ...CLOSED, channel, selected });
    },
    returnToEdit: (id) => {
      publish({ ...current, returnTo: editFocus(id) });
    },
    snapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export { type ScheduleList, type ScheduleListState, createScheduleList };
