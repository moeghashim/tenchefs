import { AddressLimit, Caller } from "../../../identities/server.ts";
import {
  AgentSessionResponseSchema,
  CreateJoinCodeRequestSchema,
  JoinCodeResponseSchema,
  RedeemJoinCodeRequestSchema,
} from "./wire.ts";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import type { HumanIdentity, Identity } from "../../../identities/index.ts";
import { joinCodesPath, redeemJoinCodePath } from "../../join-codes.ts";
import { AgentSessions } from "./service.ts";
import { Effect } from "effect";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";
import { clientAddress } from "../../../http/server.ts";

const ALL_ERRORS = { errors: "all" } as const;
const CREATED = 201;
const FORBIDDEN = 403;

const humanOnly: Refusal = {
  code: "human_only",
  message: "Only a human identity can create an agent with a join code.",
  status: FORBIDDEN,
};

function isHuman(caller: Identity): caller is HumanIdentity {
  return caller.kind === "human";
}

const createRoute: Route<Caller | AgentSessions> = {
  handle: () =>
    Effect.gen(function* createJoinCodeRoute() {
      const caller = yield* Effect.filterOrFail(Caller, isHuman, () => humanOnly);
      const body = yield* HttpServerRequest.schemaBodyJson(CreateJoinCodeRequestSchema, ALL_ERRORS);
      const agentSessions = yield* AgentSessions;
      const created = yield* agentSessions.createJoinCode({ ...body, caller });
      return yield* HttpServerResponse.schemaJson(JoinCodeResponseSchema)(created, { status: CREATED });
    }),
  method: "POST",
  path: joinCodesPath,
};

const redeemRoute: Route<AgentSessions | AddressLimit> = {
  handle: () =>
    Effect.gen(function* redeemJoinCodeRoute() {
      const limit = yield* AddressLimit;
      const address = yield* clientAddress;
      yield* limit.admit(address);
      const body = yield* HttpServerRequest.schemaBodyJson(RedeemJoinCodeRequestSchema, ALL_ERRORS);
      const agentSessions = yield* AgentSessions;
      const issued = yield* agentSessions.redeemJoinCode(body);
      return yield* HttpServerResponse.schemaJson(AgentSessionResponseSchema)(issued);
    }),
  method: "POST",
  path: redeemJoinCodePath,
};

export const joinCodeRoutes: readonly Route<Caller | AgentSessions>[] = [createRoute];

export const openJoinCodeRoutes: readonly Route<AgentSessions | AddressLimit>[] = [redeemRoute];
