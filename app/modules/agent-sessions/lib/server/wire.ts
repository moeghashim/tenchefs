import { AgentIdentitySchema, SentDescriptionSchema, SentDisplayNameSchema } from "../../../identities/server.ts";
import type {
  AgentJoinCollectedResponse,
  AgentJoinRequestResponse,
  AgentJoinRequestStartedResponse,
  AgentSessionResponse,
  DenyAgentJoinResponse,
  LeaveResponse,
  ListAgentSessionsResponse,
  ListedAgentSession,
  RevokeAgentSessionResponse,
} from "../../index.ts";
import { identityNamePattern, isIdentityName, isToken, tokenPattern } from "../../../identities/index.ts";
import { isWebUrl, matchesWire } from "../../../http/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import type { JoinCodeResponse } from "../../join-codes.ts";
import { Schema } from "effect";
import { idleExpiryPattern } from "../../index.ts";
import { userCodePattern } from "../../../logins/index.ts";

const identityNameRule = Schema.isPattern(identityNamePattern, {
  message: "Use 1-64 lowercase letters, digits or '-'.",
});
const IdentityNameSchema = Schema.String.check(identityNameRule.abort()).pipe(
  Schema.refine(isIdentityName, { identifier: "IdentityName" }),
);

const IdleExpirySchema = Schema.String.check(
  Schema.isPattern(idleExpiryPattern, {
    message: "Use a whole number of seconds, minutes, hours or days, such as 30d or 12h.",
  }).abort(),
);

const HOST_LENGTH = { maximum: 253, minimum: 1 } as const;

const HostSchema = Schema.String.check(
  Schema.isBetweenLength(HOST_LENGTH.minimum, HOST_LENGTH.maximum, { message: "Use 1-253 characters." }).abort(),
);

const SESSION_URL_MAX_LENGTH = 2048;

function isSessionUrl(text: string): boolean {
  return text.length <= SESSION_URL_MAX_LENGTH && isWebUrl(text);
}

const SessionUrlSchema = Schema.String.check(
  Schema.makeFilter(isSessionUrl, {
    message: "Use an absolute http or https URL of at most 2048 characters, such as https://example.com/sessions/1.",
  }).abort(),
);

const ListedAgentSessionSchema = matchesWire<ListedAgentSession>()(
  Schema.Struct({
    expiresAt: IsoTimeSchema,
    host: Schema.optionalKey(HostSchema),
    issuedAt: IsoTimeSchema,
    lastUsedAt: Schema.optionalKey(IsoTimeSchema),
    sessionUrl: Schema.optionalKey(SessionUrlSchema),
  }),
);

const TokenSchema = Schema.String.check(Schema.isPattern(tokenPattern).abort()).pipe(
  Schema.refine(isToken, { identifier: "Token" }),
);

const JoinRequestSchema = Schema.Struct({
  as: IdentityNameSchema,
  displayName: Schema.optionalKey(SentDisplayNameSchema),
  force: Schema.optionalKey(Schema.Boolean),
  host: Schema.optionalKey(HostSchema),
  idleExpiry: Schema.optionalKey(IdleExpirySchema),
  requireDisplayName: Schema.optionalKey(Schema.Boolean),
  sessionUrl: Schema.optionalKey(SessionUrlSchema),
});

const AgentSessionResponseSchema = matchesWire<AgentSessionResponse>()(
  Schema.Struct({
    agentSessionToken: TokenSchema,
    created: Schema.Boolean,
    expiresAt: IsoTimeSchema,
    identity: IdentityNameSchema,
    issuedAt: IsoTimeSchema,
    sessionUrl: Schema.optionalKey(SessionUrlSchema),
  }),
);

const ListAgentSessionsResponseSchema = matchesWire<ListAgentSessionsResponse>()(
  Schema.Struct({ agentSessions: Schema.Array(ListedAgentSessionSchema) }),
);

const RevokeAgentSessionResponseSchema = matchesWire<RevokeAgentSessionResponse>()(
  Schema.Struct({ revoked: Schema.Boolean }),
);

const LeaveResponseSchema = matchesWire<LeaveResponse>()(Schema.Struct({ revoked: Schema.Literal(true) }));

const StartAgentJoinRequestSchema = Schema.Struct({
  as: IdentityNameSchema,
  host: HostSchema,
  idleExpiry: Schema.optionalKey(IdleExpirySchema),
  sessionUrl: Schema.optionalKey(SessionUrlSchema),
});

const CollectAgentJoinRequestSchema = Schema.Struct({ requestId: Schema.String });

const ApproveAgentJoinRequestSchema = Schema.Struct({
  force: Schema.optionalKey(Schema.Boolean),
  idleExpiry: Schema.optionalKey(IdleExpirySchema),
});

const UserCodeSchema = Schema.String.check(Schema.isPattern(userCodePattern));

const AgentJoinRequestStartedResponseSchema = matchesWire<AgentJoinRequestStartedResponse>()(
  Schema.Struct({
    approvalPath: Schema.String,
    expiresAt: IsoTimeSchema,
    requestId: TokenSchema,
    userCode: UserCodeSchema,
  }),
);

const PendingSchema = Schema.Struct({ status: Schema.Literal("pending") });

const ApprovedSchema = Schema.Struct({ agentSession: AgentSessionResponseSchema, status: Schema.Literal("approved") });

const AgentJoinCollectedResponseSchema = matchesWire<AgentJoinCollectedResponse>()(
  Schema.Union([PendingSchema, ApprovedSchema]),
);

const AgentJoinRequestViewSchema = Schema.Struct({
  approved: Schema.Boolean,
  as: Schema.String,
  creates: Schema.Boolean,
  expiresAt: IsoTimeSchema,
  host: HostSchema,
  idleExpiry: IdleExpirySchema,
  joins: IdentityNameSchema,
  liveSessionExpiresAt: Schema.optionalKey(IsoTimeSchema),
  userCode: UserCodeSchema,
});

const AgentJoinRequestResponseSchema = matchesWire<AgentJoinRequestResponse>()(
  Schema.Struct({ agentJoinRequest: AgentJoinRequestViewSchema }),
);

const DenyAgentJoinResponseSchema = matchesWire<DenyAgentJoinResponse>()(
  Schema.Struct({ denied: Schema.Literal(true), userCode: UserCodeSchema }),
);

const CreateJoinCodeRequestSchema = Schema.Struct({
  description: Schema.optionalKey(SentDescriptionSchema),
  displayName: Schema.optionalKey(SentDisplayNameSchema),
  name: IdentityNameSchema,
});

const RedeemJoinCodeRequestSchema = Schema.Struct({
  host: Schema.optionalKey(HostSchema),
  idleExpiry: Schema.optionalKey(IdleExpirySchema),
  joinCode: Schema.String,
  sessionUrl: Schema.optionalKey(SessionUrlSchema),
});

const JoinCodeResponseSchema = matchesWire<JoinCodeResponse>()(
  Schema.Struct({ expiresAt: IsoTimeSchema, identity: AgentIdentitySchema, joinCode: TokenSchema }),
);

export { CreateJoinCodeRequestSchema, JoinCodeResponseSchema, RedeemJoinCodeRequestSchema };

export {
  AgentJoinCollectedResponseSchema,
  AgentJoinRequestResponseSchema,
  AgentJoinRequestStartedResponseSchema,
  AgentSessionResponseSchema,
  ApproveAgentJoinRequestSchema,
  CollectAgentJoinRequestSchema,
  DenyAgentJoinResponseSchema,
  JoinRequestSchema,
  LeaveResponseSchema,
  ListAgentSessionsResponseSchema,
  RevokeAgentSessionResponseSchema,
  StartAgentJoinRequestSchema,
};
