import { identityResponseSchemas, loginResponseSchemas } from "../../app/modules/identities/server.ts";
import {
  messageResponseSchemas,
  scheduledMessageResponseSchemas,
  searchResponseSchemas,
} from "../../app/modules/scheduled-messages/server.ts";
import { agentSessionResponseSchemas } from "../../app/modules/agent-sessions/server.ts";
import { channelResponseSchemas } from "../../app/modules/channels/server.ts";
import { commandResponseSchemas } from "../../app/modules/commands/server.ts";
import { eventResponseSchemas } from "../../app/modules/events/server.ts";
import { httpResponseSchemas } from "../../app/modules/http/server.ts";
import { inboxResponseSchemas } from "../../app/modules/inbox/server.ts";
import { triggerResponseSchemas } from "../../app/modules/triggers/server.ts";

const responseSchemas = {
  "agent-sessions": agentSessionResponseSchemas,
  channels: channelResponseSchemas,
  commands: commandResponseSchemas,
  events: eventResponseSchemas,
  http: httpResponseSchemas,
  identities: identityResponseSchemas,
  inbox: inboxResponseSchemas,
  logins: loginResponseSchemas,
  messages: messageResponseSchemas,
  "scheduled-messages": scheduledMessageResponseSchemas,
  search: searchResponseSchemas,
  triggers: triggerResponseSchemas,
};

export { responseSchemas };
