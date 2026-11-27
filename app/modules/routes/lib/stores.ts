import type {
  AgentJoinApprovals,
  ApprovalCode,
  BoardStore,
  ChannelCreation,
  LoginApprovals,
  ScheduleList,
  Scheduling,
  Session,
  SessionList,
} from "../../board/index.ts";
import type { Reading, Unread } from "../../unread/index.ts";
import type { Composer } from "../../composer/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import type { Layout } from "../../layout/index.ts";
import type { Search } from "../../search/web.ts";

interface Stores {
  readonly agentJoinApprovals: AgentJoinApprovals;
  readonly approvalCode: ApprovalCode;
  readonly boardStore: BoardStore;
  readonly channelCreation: ChannelCreation;
  readonly composer: Composer;
  readonly keymap: Keymap;
  readonly layout: Layout;
  readonly loginApprovals: LoginApprovals;
  readonly reading: Reading;
  readonly scheduleList: ScheduleList;
  readonly scheduling: Scheduling;
  readonly search: Search;
  readonly session: Session;
  readonly sessionList: SessionList;
  readonly unread: Unread;
}

export type { Stores };
