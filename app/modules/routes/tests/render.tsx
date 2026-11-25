import type { AgentJoinApprovals, LoginApprovals, Session } from "../../board/index.ts";
import type { BoardStore, BoardStoreClient, ComposerOptions, Live, Reading, Unread } from "./defaults.ts";
import { adminClient, anonymousClient } from "./identities.ts";
import { boardStoreFor, composerFor, createKeymap, createUnread, readingFor, unreadFor } from "./defaults.ts";
import { cleanup, render } from "@testing-library/react";
import { createAgentJoinApprovals, createLoginApprovals } from "../../board/index.ts";
import { onTestFinished, vi } from "vitest";
import type { Composer } from "../../composer/index.ts";
import { CookoutApp } from "../index.tsx";
import type { CookoutClient } from "../../sdk/index.ts";
import type { Layout } from "../../layout/index.ts";
import type { Search } from "../../search/web.ts";
import { createLayout } from "../../layout/index.ts";
import { createSearch } from "../../search/web.ts";

type AppClient = BoardStoreClient &
  Pick<
    CookoutClient,
    | "ackAll"
    | "approveAgentJoin"
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
    | "react"
    | "unreact"
    | "removeAdmin"
    | "setDescription"
    | "setDisplayName"
    | "whoami"
  >;

interface BoardOpening {
  readonly hash: string;
  readonly composer?: Composer;
  readonly storage?: ComposerOptions["storage"] | undefined;
  readonly layout?: Layout;
  readonly live?: Live;
  readonly loginApprovals?: LoginApprovals;
  readonly agentJoinApprovals?: AgentJoinApprovals;
  readonly boardStore?: BoardStore;
  readonly reading?: Reading;
  readonly search?: Search;
  readonly session: Session;
  readonly unread?: Unread;
}

interface Opening {
  readonly hash: string;
  readonly client: AppClient;
  readonly boardStore?: BoardStore;
  readonly loginApprovals?: LoginApprovals;
  readonly agentJoinApprovals?: AgentJoinApprovals;
  readonly pageSize?: number;
  readonly searchLimit?: number;
  readonly session?: Session;
  readonly live?: Live;
  readonly reading?: Reading;
  readonly storage?: ComposerOptions["storage"];
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

function anonymousAgentJoinRequests(): Pick<
  CookoutClient,
  "approveAgentJoin" | "denyAgentJoin" | "getAgentJoinRequest"
> {
  return {
    approveAgentJoin: async (userCode, approval) => {
      const approved = await anonymousClient().approveAgentJoin(userCode, approval);
      return approved;
    },
    denyAgentJoin: async (userCode) => {
      const denied = await anonymousClient().denyAgentJoin(userCode);
      return denied;
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

function scrollingStubbed(): void {
  if ("scrollIntoView" in Element.prototype) {
    return;
  }
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn<() => void>() });
  onTestFinished(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });
}

const SEARCH_PAUSE_MS = 10;

function searchFor(boardStore: BoardStore, { searchLimit }: Pick<Opening, "searchLimit">): Search {
  return createSearch({
    pause: SEARCH_PAUSE_MS,
    search: boardStore.calls.search,
    ...(typeof searchLimit === "number" && { limit: searchLimit }),
  });
}

export function browserLayout(): Layout {
  return createLayout({ root: globalThis.document.documentElement, storage: globalThis.localStorage });
}

export function openBoard(opening: BoardOpening): () => void {
  scrollingStubbed();
  globalThis.location.hash = opening.hash;
  const boardStore = boardStoreFor({ boardStore: opening.boardStore, client: adminClient(), live: opening.live });
  const composer = composerFor({ boardStore, composer: opening.composer, storage: opening.storage });
  const unread = unreadFor({ boardStore, unread: opening.unread });
  const layout = opening.layout ?? browserLayout();
  const { agentJoinApprovals, loginApprovals } = approvalsOf(opening);
  onTestFinished(cleanup);
  return render(
    <CookoutApp
      agentJoinApprovals={agentJoinApprovals}
      boardStore={boardStore}
      composer={composer}
      keymap={createKeymap({ platform: globalThis.navigator.platform })}
      layout={layout}
      loginApprovals={loginApprovals}
      reading={readingFor(opening.reading)}
      search={opening.search ?? searchFor(boardStore, {})}
      session={opening.session}
      unread={unread}
    />,
  ).unmount;
}

export function openAt(opening: Opening): () => void {
  const boardStore = boardStoreFor(opening);
  const session = opening.session ?? boardStore.session;
  return openBoard({
    hash: opening.hash,
    ...(opening.live && { live: opening.live }),
    ...(opening.loginApprovals && { loginApprovals: opening.loginApprovals }),
    ...(opening.agentJoinApprovals && { agentJoinApprovals: opening.agentJoinApprovals }),
    boardStore,
    reading: readingFor(opening.reading),
    search: searchFor(boardStore, opening),
    session,
    storage: opening.storage,
    unread: createUnread({ boardStore }),
  });
}
