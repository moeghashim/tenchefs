import type {
  AgentJoinCalls,
  AgentSessionResponse,
  JoinRequest,
  LeaveResponse,
  ListAgentSessionsResponse,
  RevokeAgentSessionResponse,
} from "../../agent-sessions/index.ts";
import {
  agentJoinRequestApprovalPath,
  agentJoinRequestDenialPath,
  agentJoinRequestPath,
  agentJoinRequestsPath,
  agentSessionPath,
  collectAgentJoinRequestPath,
  identityAgentSessionPath,
} from "../../agent-sessions/index.ts";
import {
  isAgentJoinCollectedResponse,
  isAgentJoinRequestResponse,
  isAgentJoinRequestStartedResponse,
  isAgentSessionResponse,
  isDenyAgentJoinResponse,
  isJoinCodeResponse,
  isLeaveResponse,
  isListAgentSessionsResponse,
  isRevokeAgentSessionResponse,
} from "./generated/validators.js";
import { joinCodesPath, redeemJoinCodePath } from "../../agent-sessions/join-codes.ts";
import type { ClientConnection } from "./request.ts";
import type { JoinCodeCalls } from "../../agent-sessions/join-codes.ts";
import { send } from "./request.ts";

type AgentApprovalCalls = AgentJoinCalls & JoinCodeCalls;

interface AgentSessionCalls extends AgentApprovalCalls {
  readonly join: (request: JoinRequest) => Promise<AgentSessionResponse>;
  readonly leave: () => Promise<LeaveResponse>;
  readonly listAgentSessions: (agent: string) => Promise<ListAgentSessionsResponse>;
  readonly revokeAgentSession: (agent: string) => Promise<RevokeAgentSessionResponse>;
}

function agentJoinCalls(server: ClientConnection): AgentJoinCalls {
  return {
    approveAgentJoin: async (userCode, approval = {}) => {
      const approved = await send(server, {
        body: approval,
        isExpected: isAgentJoinRequestResponse,
        method: "PUT",
        params: { code: userCode },
        path: agentJoinRequestApprovalPath,
      });
      return approved;
    },
    collectAgentJoin: async (requestId) => {
      const collected = await send(server, {
        body: { requestId },
        isExpected: isAgentJoinCollectedResponse,
        method: "POST",
        path: collectAgentJoinRequestPath,
      });
      return collected;
    },
    denyAgentJoin: async (userCode) => {
      const denied = await send(server, {
        isExpected: isDenyAgentJoinResponse,
        method: "PUT",
        params: { code: userCode },
        path: agentJoinRequestDenialPath,
      });
      return denied;
    },
    getAgentJoinRequest: async (userCode) => {
      const found = await send(server, {
        isExpected: isAgentJoinRequestResponse,
        method: "GET",
        params: { code: userCode },
        path: agentJoinRequestPath,
      });
      return found;
    },
    startAgentJoin: async (body) => {
      const started = await send(server, {
        body,
        isExpected: isAgentJoinRequestStartedResponse,
        method: "POST",
        path: agentJoinRequestsPath,
      });
      return started;
    },
  };
}

function joinCodeCalls(server: ClientConnection): JoinCodeCalls {
  return {
    createJoinCode: async (body) => {
      const created = await send(server, {
        body,
        isExpected: isJoinCodeResponse,
        method: "POST",
        path: joinCodesPath,
      });
      return created;
    },
    redeemJoinCode: async (body) => {
      const issued = await send(server, {
        body,
        isExpected: isAgentSessionResponse,
        method: "POST",
        path: redeemJoinCodePath,
      });
      return issued;
    },
  };
}

function agentSessionCalls(server: ClientConnection): AgentSessionCalls {
  return {
    ...agentJoinCalls(server),
    ...joinCodeCalls(server),
    join: async (body) => {
      const issued = await send(server, {
        body,
        isExpected: isAgentSessionResponse,
        method: "POST",
        path: agentSessionPath,
      });
      return issued;
    },
    leave: async () => {
      const left = await send(server, { isExpected: isLeaveResponse, method: "DELETE", path: agentSessionPath });
      return left;
    },
    listAgentSessions: async (agent) => {
      const listed = await send(server, {
        isExpected: isListAgentSessionsResponse,
        method: "GET",
        params: { name: agent },
        path: identityAgentSessionPath,
      });
      return listed;
    },
    revokeAgentSession: async (agent) => {
      const revoked = await send(server, {
        isExpected: isRevokeAgentSessionResponse,
        method: "DELETE",
        params: { name: agent },
        path: identityAgentSessionPath,
      });
      return revoked;
    },
  };
}

export type { AgentSessionResponse, JoinRequest, LeaveResponse } from "../../agent-sessions/index.ts";
export { type AgentApprovalCalls, type AgentSessionCalls, agentSessionCalls };
