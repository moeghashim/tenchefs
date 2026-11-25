import type { Identity } from "../../identities/index.ts";
import type { IsoTime } from "../../time/index.ts";

interface InboxAgentJoinRequest {
  readonly userCode: string;
  readonly agent: Identity;
  readonly host: string;
  readonly text: string;
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
  readonly liveSessionExpiresAt?: IsoTime;
}

interface Asking {
  readonly agent: string;
  readonly host: string;
}

function agentJoinRequestText({ agent, host }: Asking): string {
  return `@${agent} asks to join from ${host}.`;
}

export { type InboxAgentJoinRequest, agentJoinRequestText };
