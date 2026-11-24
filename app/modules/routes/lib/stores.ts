import type { AgentJoinApprovals, Board, BoardStore, LoginApprovals, Session } from "../../board/index.ts";
import type { Reading, Unread } from "../../unread/index.ts";
import type { Composer } from "../../composer/index.ts";
import type { Layout } from "../../layout/index.ts";
import type { Live } from "../../live/index.ts";
import type { Search } from "../../search/web.ts";

interface Stores {
  readonly agentJoinApprovals: AgentJoinApprovals;
  readonly board: Board;
  readonly boardStore: BoardStore;
  readonly composer: Composer;
  readonly layout: Layout;
  readonly live: Live | null;
  readonly loginApprovals: LoginApprovals;
  readonly reading: Reading;
  readonly search: Search;
  readonly session: Session;
  readonly unread: Unread;
}

export type { Stores };
