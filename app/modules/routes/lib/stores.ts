import type { AgentJoinApprovals, LoginApprovals, Session } from "../../session/index.ts";
import type { Board, BoardStore } from "../../board/index.ts";
import type { Reading, Unread } from "../../unread/index.ts";
import type { Composer } from "../../composer/index.ts";
import type { Layout } from "../../layout/index.ts";
import type { Live } from "../../live/index.ts";

interface Stores {
  readonly agentJoinApprovals: AgentJoinApprovals;
  readonly board: Board;
  readonly boardStore: BoardStore;
  readonly composer: Composer;
  readonly layout: Layout;
  readonly live: Live | null;
  readonly loginApprovals: LoginApprovals;
  readonly reading: Reading;
  readonly session: Session;
  readonly unread: Unread;
}

export type { Stores };
