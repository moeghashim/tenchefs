import {
  collectLoginRequestPath,
  loginPath,
  loginRequestApprovalPath,
  loginRequestPath,
  loginRequestsPath,
} from "../../logins/index.ts";
import {
  isLoginCollectedResponse,
  isLoginRequestResponse,
  isLoginRequestStartedResponse,
  isLogoutResponse,
} from "./generated/validators.js";
import type { ClientConnection } from "./request.ts";
import type { LoginCalls } from "../../logins/index.ts";
import { send } from "./request.ts";

function loginCalls(server: ClientConnection): LoginCalls {
  return {
    approveLogin: async (userCode) => {
      const params = { code: userCode };
      const approved = await send(server, {
        isExpected: isLoginRequestResponse,
        method: "PUT",
        params,
        path: loginRequestApprovalPath,
      });
      return approved;
    },
    collectLogin: async (requestId) => {
      const body = { requestId };
      const collected = await send(server, {
        body,
        isExpected: isLoginCollectedResponse,
        method: "POST",
        path: collectLoginRequestPath,
      });
      return collected;
    },
    getLoginRequest: async (userCode) => {
      const params = { code: userCode };
      const found = await send(server, {
        isExpected: isLoginRequestResponse,
        method: "GET",
        params,
        path: loginRequestPath,
      });
      return found;
    },
    revokeLogin: async () => {
      const revoked = await send(server, { isExpected: isLogoutResponse, method: "DELETE", path: loginPath });
      return revoked;
    },
    startLogin: async (body) => {
      const started = await send(server, {
        body,
        isExpected: isLoginRequestStartedResponse,
        method: "POST",
        path: loginRequestsPath,
      });
      return started;
    },
  };
}

export { loginCalls };
export type { LoginCalls } from "../../logins/index.ts";
