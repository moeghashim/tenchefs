import type { CookoutClient, CookoutEvent, ScheduledMessage, ScheduledMessageId } from "../../sdk/index.ts";
import type { Failure } from "./failure.ts";
import type { Slice } from "./slice.ts";
import { failure } from "./failure.ts";

type ListedSchedules =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly schedules: readonly ScheduledMessage[] }
  | Failure;

interface Schedules {
  readonly listed: ListedSchedules;
  readonly deleted: ReadonlySet<ScheduledMessageId>;
}

type SchedulesClient = Pick<CookoutClient, "listScheduledMessages">;

const EMPTY: Schedules = { deleted: new Set(), listed: { status: "loading" } };

function withSchedule(schedules: readonly ScheduledMessage[], changed: ScheduledMessage): readonly ScheduledMessage[] {
  const held = schedules.find((schedule) => schedule.id === changed.id) ?? null;
  if (held !== null && JSON.stringify(held) === JSON.stringify(changed)) {
    return schedules;
  }
  const others = schedules.filter((schedule) => schedule.id !== changed.id);
  return [...others, changed].toSorted((first, second) => first.id - second.id);
}

function listedWith(listed: ListedSchedules, changed: ScheduledMessage, deleted: boolean): ListedSchedules {
  if (listed.status !== "loaded") {
    return listed;
  }
  if (deleted) {
    if (!listed.schedules.some((schedule) => schedule.id === changed.id)) {
      return listed;
    }
    return { schedules: listed.schedules.filter((schedule) => schedule.id !== changed.id), status: "loaded" };
  }
  const schedules = withSchedule(listed.schedules, changed);
  if (schedules === listed.schedules) {
    return listed;
  }
  return { schedules, status: "loaded" };
}

function deletedWith(state: Schedules, id: ScheduledMessageId, deleted: boolean): Schedules["deleted"] {
  if (!deleted || state.deleted.has(id)) {
    return state.deleted;
  }
  return new Set([...state.deleted, id]);
}

function schedulesApplied(state: Schedules, event: CookoutEvent): Schedules {
  if (event.type !== "scheduled-message") {
    return state;
  }
  const { deleted, scheduledMessage } = event;
  const listed = listedWith(state.listed, scheduledMessage, deleted);
  const deletedIds = deletedWith(state, scheduledMessage.id, deleted);
  if (listed === state.listed && deletedIds === state.deleted) {
    return state;
  }
  return { deleted: deletedIds, listed };
}

const schedulesSlice: Slice<Schedules, SchedulesClient> = {
  apply: schedulesApplied,
  empty: EMPTY,
  read: async (client, held) => {
    try {
      const { scheduledMessages } = await client.listScheduledMessages();
      return { deleted: held.deleted, listed: { schedules: scheduledMessages, status: "loaded" } };
    } catch (error: unknown) {
      return { deleted: held.deleted, listed: failure(error) };
    }
  },
};

export { type ListedSchedules, type Schedules, type SchedulesClient, schedulesSlice };
