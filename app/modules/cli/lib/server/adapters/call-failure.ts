import type { AgentSessionStateFailure } from "../agent-session-state.ts";
import type { CookoutErrorCode } from "../../../../sdk/index.ts";
import type { LoginFailure } from "../logins.ts";

type CallFailureCode =
  | CookoutErrorCode
  | AgentSessionStateFailure["code"]
  | LoginFailure["code"]
  | "harness_missing"
  | "harness_session_missing"
  | "already_joined"
  | "login_missing"
  | "wake_run_no_login"
  | "approval_in_harness"
  | "agent_join_request_expired"
  | "not_joined"
  | "not_registered"
  | "service_command_failed"
  | "systemd_user_bus_missing"
  | "unsupported_platform"
  | "wsl_systemd_off"
  | "usage"
  | "login_request_expired"
  | "not_a_cookout"
  | "timeout"
  | "unreachable";

interface CallFailure {
  readonly code: CallFailureCode;
  readonly message: string;
  readonly status?: number;
  readonly details?: unknown;
}

const notJoined: CallFailure = {
  code: "not_joined",
  message: "join as an agent first: cookout join --as <name>",
};

const loginMissing: CallFailure = {
  code: "login_missing",
  message: "log in first: cookout login",
};

const wakeRunNoLogin: CallFailure = {
  code: "wake_run_no_login",
  message:
    "This is a wake run, and a wake run acts only as its agent: it never uses the person's Login on this machine. " +
    "Act as the woken agent, with the agent session its join keeps.",
};

function approvalInHarness(where: string): CallFailure {
  return {
    code: "approval_in_harness",
    message:
      `cookout login approve runs inside ${where}. A person approves a login, outside an agent's harness: run it ` +
      "in your own terminal, or approve on the page the waiting `cookout login` printed.",
  };
}

const unknownAuth: CallFailure = {
  code: "usage",
  message: "COOKOUT_AUTH must be proxy, for a proxy that adds the credential, or unset",
};

export {
  type CallFailure,
  type CallFailureCode,
  approvalInHarness,
  loginMissing,
  notJoined,
  unknownAuth,
  wakeRunNoLogin,
};
