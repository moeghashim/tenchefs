import {
  collectLoginRequestPath,
  logOutEverywherePath,
  loginLinkPath,
  loginPath,
  loginRequestApprovalPath,
  loginRequestPath,
  loginRequestsPath,
  redeemLoginLinkPath,
  sessionByIdPath,
  sessionsPath,
} from "../../logins/index.ts";
import {
  isIdentityResponse,
  isListSessionsResponse,
  isLogOutEverywherePreview,
  isLogOutEverywhereResponse,
  isLoginCollectedResponse,
  isLoginLinkResponse,
  isLoginRequestResponse,
  isLoginRequestStartedResponse,
  isLogoutResponse,
  isRevokeSessionResponse,
  isWebLoginCollectedResponse,
} from "./generated/validators.js";
import type { ClientConnection } from "./request.ts";
import type { LoginCalls } from "../../logins/index.ts";
import { send } from "./request.ts";

type SessionCalls = Pick<LoginCalls, "listSessions" | "revokeSession" | "previewLogOutEverywhere" | "logOutEverywhere">;

function sessionCalls(server: ClientConnection): SessionCalls {
  return {
    listSessions: async () => {
      const listed = await send(server, { isExpected: isListSessionsResponse, method: "GET", path: sessionsPath });
      return listed;
    },
    logOutEverywhere: async () => {
      const ended = await send(server, {
        isExpected: isLogOutEverywhereResponse,
        method: "POST",
        path: logOutEverywherePath,
      });
      return ended;
    },
    previewLogOutEverywhere: async () => {
      const preview = await send(server, {
        isExpected: isLogOutEverywherePreview,
        method: "GET",
        path: logOutEverywherePath,
      });
      return preview;
    },
    revokeSession: async (id) => {
      const params = { id };
      const revoked = await send(server, {
        isExpected: isRevokeSessionResponse,
        method: "DELETE",
        params,
        path: sessionByIdPath,
      });
      return revoked;
    },
  };
}

function loginLinkCalls(server: ClientConnection): Pick<LoginCalls, "createLoginLink" | "redeemLoginLink"> {
  return {
    createLoginLink: async (name) => {
      const params = { name };
      const made = await send(server, { isExpected: isLoginLinkResponse, method: "POST", params, path: loginLinkPath });
      return made;
    },
    redeemLoginLink: async (secret) => {
      const body = { secret };
      const redeemed = await send(server, {
        body,
        isExpected: isIdentityResponse,
        method: "POST",
        path: redeemLoginLinkPath,
      });
      return redeemed;
    },
  };
}

function webLoginCalls(server: ClientConnection): Pick<LoginCalls, "startWebLogin" | "collectWebLogin"> {
  return {
    collectWebLogin: async (requestId) => {
      const body = { kind: "web", requestId };
      const collected = await send(server, {
        body,
        isExpected: isWebLoginCollectedResponse,
        method: "POST",
        path: collectLoginRequestPath,
      });
      return collected;
    },
    startWebLogin: async () => {
      const body = { kind: "web" };
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

function loginCalls(server: ClientConnection): LoginCalls {
  return {
    ...sessionCalls(server),
    ...loginLinkCalls(server),
    ...webLoginCalls(server),
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
