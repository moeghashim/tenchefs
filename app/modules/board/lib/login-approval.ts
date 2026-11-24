import type { CookoutClient, Refusal } from "../../sdk/index.ts";
import { refusalOf } from "../../sdk/index.ts";

type LoginApprovalClient = Pick<CookoutClient, "approveLogin" | "getLoginRequest">;

type LoginRequest = Awaited<ReturnType<CookoutClient["getLoginRequest"]>>["loginRequest"];

type LoginApprovalState =
  | { readonly status: "loading" }
  | { readonly status: "refused"; readonly refusal: Refusal }
  | { readonly status: "shown" | "approving" | "approved"; readonly loginRequest: LoginRequest };

interface LoginApproval {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => LoginApprovalState;
  readonly approve: () => void;
}

interface LoginApprovals {
  readonly forCode: (userCode: string) => LoginApproval;
}

function statusOf(loginRequest: LoginRequest): LoginApprovalState {
  if (loginRequest.approved) {
    return { loginRequest, status: "approved" };
  }
  return { loginRequest, status: "shown" };
}

function createLoginApproval(client: LoginApprovalClient, userCode: string): LoginApproval {
  const listeners = new Set<() => void>();
  let current: LoginApprovalState = { status: "loading" };
  let loaded: Promise<void> | null = null;

  function publish(state: LoginApprovalState): void {
    current = state;
    for (const listener of listeners) {
      listener();
    }
  }

  async function settle(call: Promise<{ readonly loginRequest: LoginRequest }>): Promise<void> {
    try {
      const { loginRequest } = await call;
      publish(statusOf(loginRequest));
    } catch (error: unknown) {
      publish({ refusal: refusalOf(error), status: "refused" });
    }
  }

  async function approveAfter(previous: Promise<void> | null, shown: LoginRequest): Promise<void> {
    await previous;
    publish({ loginRequest: shown, status: "approving" });
    await settle(client.approveLogin(userCode));
  }

  return {
    approve: () => {
      if (current.status === "shown") {
        loaded = approveAfter(loaded, current.loginRequest);
      }
    },
    snapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      loaded ??= settle(client.getLoginRequest(userCode));
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function createLoginApprovals(client: LoginApprovalClient): LoginApprovals {
  const approvals = new Map<string, LoginApproval>();
  return {
    forCode: (userCode) => {
      const made = approvals.get(userCode) ?? createLoginApproval(client, userCode);
      approvals.set(userCode, made);
      return made;
    },
  };
}

export { type LoginApproval, type LoginApprovalState, type LoginApprovals, type LoginRequest, createLoginApprovals };
