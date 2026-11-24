import { AddressLimit, Caller } from "../../../identities/server.ts";
import {
  AgentJoinCollectedResponseSchema,
  AgentJoinRequestResponseSchema,
  AgentJoinRequestStartedResponseSchema,
  ApproveAgentJoinRequestSchema,
  CollectAgentJoinRequestSchema,
  StartAgentJoinRequestSchema,
} from "./wire.ts";
import { Effect, Function, Option } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import {
  agentJoinRequestApprovalPath,
  agentJoinRequestPath,
  agentJoinRequestsPath,
  collectAgentJoinRequestPath,
} from "../../index.ts";
import { AgentSessions } from "./service.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";
import { isUserCode } from "../../../logins/index.ts";
import { token } from "../../../identities/index.ts";

const ALL_ERRORS = { errors: "all" } as const;
const CREATED = 201;
const ACCEPTED = 202;

function withinAddressLimit<Value, Failure, Needs>(
  effect: Effect.Effect<Value, Failure, Needs>,
): Effect.Effect<Value, Failure | Refusal, Needs | AddressLimit | HttpServerRequest.HttpServerRequest> {
  return Effect.gen(function* admitAddressThenRun() {
    const limit = yield* AddressLimit;
    const request = yield* HttpServerRequest.HttpServerRequest;
    yield* limit.admit(Option.getOrElse(request.remoteAddress, Function.constant("unknown")));
    return yield* effect;
  });
}

function codeParam(params: Readonly<Record<string, string>>): string {
  return String(params["code"]);
}

const userCodeSegments = { code: isUserCode };

const requestResponse = HttpServerResponse.schemaJson(AgentJoinRequestResponseSchema);

const startRoute: Route<AgentSessions | AddressLimit> = {
  handle: () =>
    withinAddressLimit(
      Effect.gen(function* startAgentJoinRequest() {
        const body = yield* HttpServerRequest.schemaBodyJson(StartAgentJoinRequestSchema, ALL_ERRORS);
        const agentSessions = yield* AgentSessions;
        const started = yield* agentSessions.startJoin(body);
        return yield* HttpServerResponse.schemaJson(AgentJoinRequestStartedResponseSchema)(started, {
          status: CREATED,
        });
      }),
    ),
  method: "POST",
  path: agentJoinRequestsPath,
};

const collectRoute: Route<AgentSessions | AddressLimit> = {
  handle: () =>
    withinAddressLimit(
      Effect.gen(function* collectAgentJoinRequest() {
        const { requestId } = yield* HttpServerRequest.schemaBodyJson(CollectAgentJoinRequestSchema);
        const agentSessions = yield* AgentSessions;
        const collected = yield* agentSessions.collectJoin(token(requestId));
        if (collected.status === "pending") {
          return yield* HttpServerResponse.schemaJson(AgentJoinCollectedResponseSchema)(collected, {
            status: ACCEPTED,
          });
        }
        return yield* HttpServerResponse.schemaJson(AgentJoinCollectedResponseSchema)(collected);
      }),
    ),
  method: "POST",
  path: collectAgentJoinRequestPath,
};

const showRoute: Route<Caller | AgentSessions> = {
  handle: (params) =>
    Effect.gen(function* showAgentJoinRequest() {
      const caller = yield* Caller;
      const agentSessions = yield* AgentSessions;
      const shown = yield* agentSessions.showJoin({ caller, userCode: codeParam(params) });
      return yield* requestResponse({ agentJoinRequest: shown });
    }),
  method: "GET",
  path: agentJoinRequestPath,
  segments: userCodeSegments,
};

const approveRoute: Route<Caller | AgentSessions> = {
  handle: (params) =>
    Effect.gen(function* approveAgentJoinRequest() {
      const caller = yield* Caller;
      const approval = yield* HttpServerRequest.schemaBodyJson(ApproveAgentJoinRequestSchema, ALL_ERRORS);
      const agentSessions = yield* AgentSessions;
      const approved = yield* agentSessions.approveJoin({ approval, caller, userCode: codeParam(params) });
      return yield* requestResponse({ agentJoinRequest: approved });
    }),
  method: "PUT",
  path: agentJoinRequestApprovalPath,
  segments: userCodeSegments,
};

export const openJoinRequestRoutes: readonly Route<AgentSessions | AddressLimit>[] = [startRoute, collectRoute];

export const joinRequestRoutes: readonly Route<Caller | AgentSessions>[] = [showRoute, approveRoute];
