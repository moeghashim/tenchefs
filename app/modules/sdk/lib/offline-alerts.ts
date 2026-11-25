import type { ClientConnection } from "./request.ts";
import type { OfflineAlertCalls } from "../../inbox/client.ts";
import { isOfflineAlertResponse } from "./generated/validators.js";
import { offlineAlertReadPath } from "../../inbox/index.ts";
import { send } from "./request.ts";

function offlineAlertCalls(server: ClientConnection): OfflineAlertCalls {
  return {
    markOfflineAlertRead: async (id) => {
      const params = { id: String(id) };
      const read = await send(server, {
        isExpected: isOfflineAlertResponse,
        method: "POST",
        params,
        path: offlineAlertReadPath,
      });
      return read;
    },
  };
}

export { offlineAlertCalls };
