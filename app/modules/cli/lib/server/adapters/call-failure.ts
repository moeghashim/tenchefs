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

const unknownAuth: CallFailure = {
  code: "usage",
  message: "COOKOUT_AUTH must be proxy, for a proxy that adds the credential, or unset",
};

export { type CallFailure, type CallFailureCode, loginMissing, notJoined, unknownAuth };
