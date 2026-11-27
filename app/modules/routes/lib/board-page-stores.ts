import type {
  ApprovalCode,
  BoardStore,
  ChannelCreation,
  ScheduleList,
  Scheduling,
  SessionList,
} from "../../board/index.ts";
import { browserClock, browserTimeZone } from "../../format/index.ts";
import {
  createApprovalCode,
  createChannelCreation,
  createScheduleList,
  createScheduling,
  createSessionList,
} from "../../board/index.ts";

const PREVIEW_PAUSE_MS = 200;

interface BoardPageStores {
  readonly approvalCode: ApprovalCode;
  readonly channelCreation: ChannelCreation;
  readonly scheduleList: ScheduleList;
  readonly scheduling: Scheduling;
  readonly sessionList: SessionList;
}

function boardPageStores(store: BoardStore): BoardPageStores {
  return {
    approvalCode: createApprovalCode(),
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
    sessionList: createSessionList(store.calls),
  };
}

export { boardPageStores };
