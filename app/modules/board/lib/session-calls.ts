import type { CookoutClient } from "../../sdk/index.ts";
import type { SessionListCalls } from "./session-list.ts";

type SessionsClient = Pick<
  CookoutClient,
  "listSessions" | "logOutEverywhere" | "previewLogOutEverywhere" | "revokeSession"
>;

function sessionCalls(client: SessionsClient): SessionListCalls {
  return {
    listSessions: async () => {
      const { sessions } = await client.listSessions();
      return sessions;
    },
    logOutEverywhere: async () => {
      await client.logOutEverywhere();
    },
    previewLogOutEverywhere: async () => {
      const { willEnd } = await client.previewLogOutEverywhere();
      return willEnd;
    },
    revokeSession: async (id) => {
      await client.revokeSession(id);
    },
  };
}

export { type SessionsClient, sessionCalls };
