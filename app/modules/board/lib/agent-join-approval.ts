import type { CookoutClient, Refusal } from "../../sdk/index.ts";
import { refusalOf } from "../../sdk/index.ts";

type AgentJoinApprovalClient = Pick<CookoutClient, "approveAgentJoin" | "denyAgentJoin" | "getAgentJoinRequest">;

type AgentJoinRequest = Awaited<ReturnType<CookoutClient["getAgentJoinRequest"]>>["agentJoinRequest"];

type AgentJoinApprovalState =
  | { readonly status: "loading" }
  | { readonly status: "refused"; readonly refusal: Refusal }
  | {
      readonly status: "shown" | "approving" | "approved" | "dismissing" | "dismissed";
      readonly agentJoinRequest: AgentJoinRequest;
      readonly idleExpiry: string;
      readonly replace: boolean;
      readonly refusal: Refusal | null;
    };

interface AgentJoinApproval {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => AgentJoinApprovalState;
  readonly editIdleExpiry: (idleExpiry: string) => void;
  readonly editReplace: (replace: boolean) => void;
  readonly approve: () => void;
  readonly dismiss: () => void;
}

interface AgentJoinApprovals {
  readonly forCode: (userCode: string) => AgentJoinApproval;
}

type Shown = Extract<AgentJoinApprovalState, { readonly agentJoinRequest: AgentJoinRequest }>;

function shownOf(agentJoinRequest: AgentJoinRequest): AgentJoinApprovalState {
  const shown = { agentJoinRequest, idleExpiry: agentJoinRequest.idleExpiry, refusal: null, replace: false };
  if (agentJoinRequest.approved) {
    return { ...shown, status: "approved" };
  }
  return { ...shown, status: "shown" };
}

function approvalOf({ idleExpiry, replace }: Shown): { readonly idleExpiry: string; readonly force?: boolean } {
  if (replace) {
    return { force: true, idleExpiry };
  }
  return { idleExpiry };
}

interface Cell {
  readonly current: () => AgentJoinApprovalState;
  readonly publish: (state: AgentJoinApprovalState) => void;
  readonly listeners: Set<() => void>;
}

function cell(): Cell {
  const listeners = new Set<() => void>();
  let state: AgentJoinApprovalState = { status: "loading" };
  return {
    current: () => state,
    listeners,
    publish: (next) => {
      state = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

interface Asked {
  readonly client: AgentJoinApprovalClient;
  readonly userCode: string;
  readonly held: Cell;
}

async function load({ client, held, userCode }: Asked): Promise<void> {
  try {
    const { agentJoinRequest } = await client.getAgentJoinRequest(userCode);
    held.publish(shownOf(agentJoinRequest));
  } catch (error: unknown) {
    held.publish({ refusal: refusalOf(error), status: "refused" });
  }
}

async function approveAfter(
  previous: Promise<void> | null,
  shown: Shown,
  { client, held, userCode }: Asked,
): Promise<void> {
  await previous;
  held.publish({ ...shown, status: "approving" });
  try {
    const { agentJoinRequest } = await client.approveAgentJoin(userCode, approvalOf(shown));
    held.publish({ ...shown, agentJoinRequest, status: "approved" });
  } catch (error: unknown) {
    held.publish({ ...shown, refusal: refusalOf(error) });
  }
}

async function dismissAfter(
  previous: Promise<void> | null,
  shown: Shown,
  { client, held, userCode }: Asked,
): Promise<void> {
  await previous;
  held.publish({ ...shown, status: "dismissing" });
  try {
    await client.denyAgentJoin(userCode);
    held.publish({ ...shown, status: "dismissed" });
  } catch (error: unknown) {
    held.publish({ ...shown, refusal: refusalOf(error) });
  }
}

function createAgentJoinApproval(client: AgentJoinApprovalClient, userCode: string): AgentJoinApproval {
  const held = cell();
  const asked = { client, held, userCode };
  let loaded: Promise<void> | null = null;

  function edit(change: Partial<Pick<Shown, "idleExpiry" | "replace">>): void {
    const current = held.current();
    if (current.status === "shown") {
      held.publish({ ...current, ...change });
    }
  }

  return {
    approve: () => {
      const current = held.current();
      if (current.status === "shown") {
        loaded = approveAfter(loaded, current, asked);
      }
    },
    dismiss: () => {
      const current = held.current();
      if (current.status === "shown") {
        loaded = dismissAfter(loaded, current, asked);
      }
    },
    editIdleExpiry: (idleExpiry) => {
      edit({ idleExpiry });
    },
    editReplace: (replace) => {
      edit({ replace });
    },
    snapshot: held.current,
    subscribe: (listener) => {
      held.listeners.add(listener);
      loaded ??= load(asked);
      return () => {
        held.listeners.delete(listener);
      };
    },
  };
}

function createAgentJoinApprovals(client: AgentJoinApprovalClient): AgentJoinApprovals {
  const approvals = new Map<string, AgentJoinApproval>();
  return {
    forCode: (userCode) => {
      const made = approvals.get(userCode) ?? createAgentJoinApproval(client, userCode);
      approvals.set(userCode, made);
      return made;
    },
  };
}

export { type AgentJoinApproval, type AgentJoinApprovalState, type AgentJoinApprovals, createAgentJoinApprovals };
