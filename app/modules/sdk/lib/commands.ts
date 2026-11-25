import type {
  AddCommandRequest,
  CallCommandRequest,
  CallCommandResponse,
  CommandWithSecretResponse,
  ListCommandsResponse,
} from "../../webhook-commands/index.ts";
import { isCallCommandResponse, isCommandWithSecretResponse, isListCommandsResponse } from "./generated/validators.js";
import {
  webhookCommandCallsPath,
  webhookCommandSecretPath,
  webhookCommandsPath,
} from "../../webhook-commands/index.ts";
import type { ClientConnection } from "./request.ts";
import { send } from "./request.ts";

interface CommandCalls {
  readonly addCommand: (request: AddCommandRequest) => Promise<CommandWithSecretResponse>;
  readonly listCommands: () => Promise<ListCommandsResponse>;
  readonly callCommand: (name: string, request: CallCommandRequest) => Promise<CallCommandResponse>;
  readonly rotateCommandSecret: (name: string) => Promise<CommandWithSecretResponse>;
}

function commandCalls(server: ClientConnection): CommandCalls {
  return {
    addCommand: async (body) => {
      const added = await send(server, {
        body,
        isExpected: isCommandWithSecretResponse,
        method: "POST",
        path: webhookCommandsPath,
      });
      return added;
    },
    callCommand: async (name, body) => {
      const called = await send(server, {
        body,
        isExpected: isCallCommandResponse,
        method: "POST",
        params: { name },
        path: webhookCommandCallsPath,
      });
      return called;
    },
    listCommands: async () => {
      const listed = await send(server, {
        isExpected: isListCommandsResponse,
        method: "GET",
        path: webhookCommandsPath,
      });
      return listed;
    },
    rotateCommandSecret: async (name) => {
      const rotated = await send(server, {
        isExpected: isCommandWithSecretResponse,
        method: "POST",
        params: { name },
        path: webhookCommandSecretPath,
      });
      return rotated;
    },
  };
}

export type {
  AddCommandRequest,
  CallCommandRequest,
  CallCommandResponse,
  CommandWithSecretResponse,
  ListCommandsResponse,
} from "../../webhook-commands/index.ts";
export { commandCalls };
