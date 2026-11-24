import type { SetTriggerRequest, TriggerCalls, TriggerResponse } from "../../triggers/index.ts";
import type { ClientConnection } from "./request.ts";
import { identityTriggerPath } from "../../triggers/index.ts";
import { isTriggerResponse } from "./generated/validators.js";
import { send } from "./request.ts";

interface Asked {
  readonly method: "GET" | "PUT" | "DELETE";
  readonly agent: string;
  readonly body?: SetTriggerRequest;
}

async function triggerCall(server: ClientConnection, { agent, body, method }: Asked): Promise<TriggerResponse> {
  const answered = await send(server, {
    body,
    isExpected: isTriggerResponse,
    method,
    params: { name: agent },
    path: identityTriggerPath,
  });
  return answered;
}

function triggerCalls(server: ClientConnection): TriggerCalls {
  return {
    clearTrigger: async (agent) => {
      const cleared = await triggerCall(server, { agent, method: "DELETE" });
      return cleared;
    },
    getTrigger: async (agent) => {
      const found = await triggerCall(server, { agent, method: "GET" });
      return found;
    },
    setTrigger: async (agent, request) => {
      const set = await triggerCall(server, { agent, body: request, method: "PUT" });
      return set;
    },
  };
}

export { triggerCalls };
export type { TriggerCalls } from "../../triggers/index.ts";
