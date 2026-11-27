import type { IdentityName } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { Refusal } from "../../../http/index.ts";

interface Live {
  readonly identity: IdentityName;
  readonly expiresAt: IsoTime;
}

interface WrongIdentity {
  readonly caller: IdentityName;
  readonly asked: IdentityName;
}

const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;

function notYourIdentity({ asked, caller }: WrongIdentity): Refusal {
  return {
    code: "not_your_identity",
    message: `This token belongs to ${caller}, not ${asked}. Join as the token's own identity.`,
    status: FORBIDDEN,
  };
}

function onlyAgentsJoin(identity: IdentityName): Refusal {
  return {
    code: "identity_kind",
    message: `${identity} is a human identity; only agent identities join.`,
    status: FORBIDDEN,
  };
}

function joinNotOwned(name: IdentityName): Refusal {
  return {
    code: "not_owner",
    message: `${name} belongs to another human. Join an agent you own, or a free name to create one.`,
    status: FORBIDDEN,
  };
}

function notBroughtIn(name: IdentityName): Refusal {
  return {
    code: "not_brought_in",
    message: `${name} already exists and you didn't bring it in, so an agent can't approve its join. Its owner can.`,
    status: FORBIDDEN,
  };
}

function agentNotFound(name: IdentityName): Refusal {
  return {
    code: "agent_not_found",
    message:
      `No active agent is called ${name}, and a join request never creates one. ` +
      "Its owner creates it first (an agent: cookout identity create; a human: Settings), then join again.",
    status: NOT_FOUND,
  };
}

function identityDeactivated(name: IdentityName): Refusal {
  return {
    code: "identity_deactivated",
    message: `${name} is deactivated. Reactivate it (cookout identity reactivate ${name}) to join it again.`,
    status: CONFLICT,
  };
}

function agentSessionLive({ expiresAt, identity }: Live): Refusal {
  return {
    code: "agent_session_live",
    details: { expiresAt },
    message: `Another session has joined as ${identity}; its agent session token expires at ${expiresAt} if unused. Run \`cookout leave\` there, or join with --force to revoke it.`,
    status: CONFLICT,
  };
}

function idleExpiryTooLong(maxIdleExpiry: string): Refusal {
  return {
    code: "idle_expiry_too_long",
    details: { maxIdleExpiry },
    message: `This cookout allows an idle expiry of at most ${maxIdleExpiry} (COOKOUT_MAX_IDLE_EXPIRY).`,
    status: BAD_REQUEST,
  };
}

function displayNameRequired(name: IdentityName): Refusal {
  return {
    code: "display_name_required",
    message: `${name} would be a new agent, and a new agent needs a display name: join with --display-name.`,
    status: BAD_REQUEST,
  };
}

function displayNameOnExistingAgent(name: IdentityName): Refusal {
  return {
    code: "display_name_on_existing_agent",
    message:
      `${name} already exists, so join takes no --display-name. Set it with ` +
      `\`cookout identity display-name ${name} <display name>\`.`,
    status: BAD_REQUEST,
  };
}

const agentSessionRequired: Refusal = {
  code: "agent_session_required",
  message: "Leave revokes the agent session token it is sent with; this request was sent with another kind of token.",
  status: BAD_REQUEST,
};

export {
  agentNotFound,
  agentSessionLive,
  agentSessionRequired,
  displayNameOnExistingAgent,
  displayNameRequired,
  identityDeactivated,
  idleExpiryTooLong,
  joinNotOwned,
  notBroughtIn,
  notYourIdentity,
  onlyAgentsJoin,
};

export { withParent } from "./parent.ts";
