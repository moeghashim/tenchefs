import { agentSessionResponseSchemas, joinCodeResponseSchemas } from "../../app/modules/agent-sessions/server.ts";
import { identityResponseSchemas, loginResponseSchemas } from "../../app/modules/identities/server.ts";
import {
  messageDeleteResponseSchemas,
  messageResponseSchemas,
  scheduledMessageResponseSchemas,
  searchResponseSchemas,
} from "../../app/modules/scheduled-messages/server.ts";
import { channelResponseSchemas } from "../../app/modules/channels/server.ts";
import { eventResponseSchemas } from "../../app/modules/events/server.ts";
import { httpResponseSchemas } from "../../app/modules/http/server.ts";
import { inboxResponseSchemas } from "../../app/modules/inbox/server.ts";
import { triggerResponseSchemas } from "../../app/modules/triggers/server.ts";
import { webhookCommandResponseSchemas } from "../../app/modules/webhook-commands/server.ts";

const responseSchemas = {
  "agent-sessions": agentSessionResponseSchemas,
  "agent-sessions/join-codes.ts": joinCodeResponseSchemas,
  channels: channelResponseSchemas,
  events: eventResponseSchemas,
  http: httpResponseSchemas,
  identities: identityResponseSchemas,
  inbox: inboxResponseSchemas,
  logins: loginResponseSchemas,
  messages: messageResponseSchemas,
  "messages/client.ts": messageDeleteResponseSchemas,
  "scheduled-messages": scheduledMessageResponseSchemas,
  search: searchResponseSchemas,
  triggers: triggerResponseSchemas,
  "webhook-commands": webhookCommandResponseSchemas,
};

export { responseSchemas };
