import type { BoardStore, ChannelCreation, ScheduleList, Scheduling } from "../../board/index.ts";
import { browserClock, browserTimeZone } from "../../format/index.ts";
import { createChannelCreation, createScheduleList, createScheduling } from "../../board/index.ts";

const PREVIEW_PAUSE_MS = 200;

interface BoardPageStores {
  readonly channelCreation: ChannelCreation;
  readonly scheduleList: ScheduleList;
  readonly scheduling: Scheduling;
}

function boardPageStores(store: BoardStore): BoardPageStores {
  return {
    channelCreation: createChannelCreation({ createChannel: store.calls.createChannel }),
    scheduleList: createScheduleList({ change: store.calls.changeScheduledMessage }),
    scheduling: createScheduling({
      clock: browserClock,
      create: store.calls.createScheduledMessage,
      edit: store.calls.editScheduledMessage,
      pause: PREVIEW_PAUSE_MS,
      preview: store.calls.previewScheduledMessage,
      timeZone: browserTimeZone(),
    }),
  };
}

export { boardPageStores };
