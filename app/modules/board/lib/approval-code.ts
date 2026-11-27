import { isUserCode } from "../../logins/index.ts";

type ApprovalCodeState =
  | { readonly status: "empty" }
  | { readonly status: "malformed"; readonly typed: string }
  | { readonly status: "typed"; readonly code: string };

interface ApprovalCode {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => ApprovalCodeState;
  readonly type: (typed: string) => void;
}

const HALF = 4;
const START = 0;
const NONE = 0;
const EMPTY: ApprovalCodeState = { status: "empty" };

function codeOf(typed: string): string {
  const upper = typed.trim().toUpperCase();
  if (upper.length === HALF + HALF && !upper.includes("-")) {
    return `${upper.slice(START, HALF)}-${upper.slice(HALF)}`;
  }
  return upper;
}

function stateOf(typed: string): ApprovalCodeState {
  const code = codeOf(typed);
  if (isUserCode(code)) {
    return { code, status: "typed" };
  }
  return { status: "malformed", typed: typed.trim() };
}

function createApprovalCode(): ApprovalCode {
  const listeners = new Set<() => void>();
  let current = EMPTY;

  function publish(state: ApprovalCodeState): void {
    current = state;
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    snapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === NONE) {
          current = EMPTY;
        }
      };
    },
    type: (typed) => {
      publish(stateOf(typed));
    },
  };
}

export { type ApprovalCode, createApprovalCode };
