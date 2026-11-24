import type { AgentJoinApprovals, LoginApprovals, Session } from "../../session/index.ts";
import type { Board, BoardOptions } from "../../board/index.ts";
import type { BoardStore, Reading, Unread } from "./defaults.ts";
import { adminClient, anonymousClient, sessionOf } from "./identities.ts";
import { boardStoreFor, createUnread, readingFor, unreadFor } from "./defaults.ts";
import { cleanup, render } from "@testing-library/react";
import { createAgentJoinApprovals, createLoginApprovals } from "../../session/index.ts";
import type { Composer } from "../../composer/index.ts";
import { CookoutApp } from "../index.tsx";
import type { CookoutClient } from "../../sdk/index.ts";
import type { Layout } from "../../layout/index.ts";
import { createBoard } from "../../board/index.ts";
import { createComposer } from "../../composer/index.ts";
import { createLayout } from "../../layout/index.ts";
import { onTestFinished } from "vitest";

type AppClient = BoardOptions["client"] &
  Pick<
    CookoutClient,
    | "ackAll"
    | "createIdentity"
    | "countMessagesBy"
    | "deactivateIdentity"
    | "deleteIdentity"
    | "inbox"
    | "inboxHistory"
    | "keepDeactivationOffer"
    | "markDeactivatedQuietAgentRead"
    | "markNudgeRead"
    | "markOfflineAlertRead"
    | "markUnread"
    | "listAgentSessions"
    | "reactivateIdentity"
    | "revokeAgentSession"
    | "rotateToken"
    | "transferAgent"
    | "listIdentities"
    | "readPositions"
    | "makeAdmin"
    | "presence"
    | "removeAdmin"
    | "setDescription"
    | "setDisplayName"
    | "whoami"
  >;

interface BoardOpening {
  readonly hash: string;
  readonly board: Board;
  readonly composer?: Composer;
  readonly layout?: Layout;
  readonly live?: NonNullable<BoardOptions["live"]>;
  readonly loginApprovals?: LoginApprovals;
  readonly agentJoinApprovals?: AgentJoinApprovals;
  readonly boardStore?: BoardStore;
  readonly reading?: Reading;
  readonly session: Session;
  readonly unread?: Unread;
}

interface Opening {
  readonly hash: string;
  readonly client: AppClient;
  readonly loginApprovals?: LoginApprovals;
  readonly agentJoinApprovals?: AgentJoinApprovals;
  readonly pageSize?: number;
  readonly session?: Session;
  readonly live?: NonNullable<BoardOptions["live"]>;
  readonly reading?: Reading;
}

function anonymousLoginRequests(): Pick<CookoutClient, "approveLogin" | "getLoginRequest"> {
  return {
    approveLogin: async (userCode) => {
      const approved = await anonymousClient().approveLogin(userCode);
      return approved;
    },
    getLoginRequest: async (userCode) => {
      const found = await anonymousClient().getLoginRequest(userCode);
      return found;
    },
  };
}

function anonymousAgentJoinRequests(): Pick<CookoutClient, "approveAgentJoin" | "getAgentJoinRequest"> {
  return {
    approveAgentJoin: async (userCode, approval) => {
      const approved = await anonymousClient().approveAgentJoin(userCode, approval);
      return approved;
    },
    getAgentJoinRequest: async (userCode) => {
      const found = await anonymousClient().getAgentJoinRequest(userCode);
      return found;
    },
  };
}

interface Approvals {
  readonly loginApprovals: LoginApprovals;
  readonly agentJoinApprovals: AgentJoinApprovals;
}

function approvalsOf(opening: BoardOpening): Approvals {
  return {
    agentJoinApprovals: opening.agentJoinApprovals ?? createAgentJoinApprovals(anonymousAgentJoinRequests()),
    loginApprovals: opening.loginApprovals ?? createLoginApprovals(anonymousLoginRequests()),
  };
}

export function browserLayout(): Layout {
  return createLayout({ root: globalThis.document.documentElement, storage: globalThis.localStorage });
}

export function openBoard(opening: BoardOpening): () => void {
  globalThis.location.hash = opening.hash;
  const composer = opening.composer ?? createComposer({ client: adminClient(), commands: opening.board.commands });
  const unread = unreadFor(opening.unread);
  const layout = opening.layout ?? browserLayout();
  const boardStore = boardStoreFor({ boardStore: opening.boardStore, client: adminClient(), live: opening.live });
  const { agentJoinApprovals, loginApprovals } = approvalsOf(opening);
  onTestFinished(cleanup);
  return render(
    <CookoutApp
      agentJoinApprovals={agentJoinApprovals}
      board={opening.board}
      boardStore={boardStore}
      composer={composer}
      layout={layout}
      live={opening.live ?? null}
      loginApprovals={loginApprovals}
      reading={readingFor(opening.reading)}
      session={opening.session}
      unread={unread}
    />,
  ).unmount;
}

export function openAt(opening: Opening): () => void {
  const session = opening.session ?? sessionOf(opening.client);
  const board = createBoard(opening);
  return openBoard({
    board,
    composer: createComposer({ ...opening, commands: board.commands }),
    hash: opening.hash,
    ...(opening.live && { live: opening.live }),
    ...(opening.loginApprovals && { loginApprovals: opening.loginApprovals }),
    ...(opening.agentJoinApprovals && { agentJoinApprovals: opening.agentJoinApprovals }),
    boardStore: boardStoreFor(opening),
    reading: readingFor(opening.reading),
    session,
    unread: createUnread(opening),
  });
}
