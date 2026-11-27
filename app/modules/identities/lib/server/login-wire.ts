import type {
  ListSessionsResponse,
  LogOutEverywherePreview,
  LogOutEverywhereResponse,
  LoginCollectedResponse,
  LoginRequestResponse,
  LoginRequestStartedResponse,
  LogoutResponse,
  RevokeSessionResponse,
  WebLoginCollectedResponse,
} from "../../../logins/index.ts";
import { hostMaximumLength, isPublicId, userCodePattern } from "../../../logins/index.ts";
import { IdentitySchema } from "./wire.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import { Schema } from "effect";
import { isToken } from "../../index.ts";
import { matchesWire } from "../../../http/index.ts";

const MINIMUM_HOST = 1;

const UserCodeSchema = Schema.String.check(Schema.isPattern(userCodePattern));

const TokenSchema = Schema.String.pipe(Schema.refine(isToken, { identifier: "Token" }));

const StartCliLoginRequestSchema = Schema.Struct({
  host: Schema.String.check(
    Schema.isTrimmed({ message: "Use no space at either end." }),
    Schema.isBetweenLength(MINIMUM_HOST, hostMaximumLength, { message: "Use 1-100 characters." }),
  ),
});

const StartWebLoginRequestSchema = Schema.Struct({ kind: Schema.Literal("web") });

const StartLoginRequestSchema = Schema.Union([StartWebLoginRequestSchema, StartCliLoginRequestSchema]);

const CollectLoginRequestSchema = Schema.Struct({
  kind: Schema.optionalKey(Schema.Literals(["web", "cli"])),
  requestId: Schema.String,
});

const LoginRequestStartedResponseSchema = matchesWire<LoginRequestStartedResponse>()(
  Schema.Struct({
    approvalPath: Schema.String,
    expiresAt: IsoTimeSchema,
    requestId: TokenSchema,
    userCode: UserCodeSchema,
  }),
);

const PendingSchema = Schema.Struct({ status: Schema.Literal("pending") });

const ApprovedSchema = Schema.Struct({
  identity: IdentitySchema,
  status: Schema.Literal("approved"),
  token: TokenSchema,
});

const LoginCollectedResponseSchema = matchesWire<LoginCollectedResponse>()(
  Schema.Union([PendingSchema, ApprovedSchema]),
);

const WebApprovedSchema = Schema.Struct({ identity: IdentitySchema, status: Schema.Literal("approved") });

const WebLoginCollectedResponseSchema = matchesWire<WebLoginCollectedResponse>()(
  Schema.Union([PendingSchema, WebApprovedSchema]),
);

const approvalRequestDetailsFields = {
  clientIp: Schema.optionalKey(Schema.String),
  createdAt: IsoTimeSchema,
  kind: Schema.Literals(["browser", "terminal", "agent_join"]),
  where: Schema.String,
};

const LoginRequestViewSchema = Schema.Struct({
  ...approvalRequestDetailsFields,
  approved: Schema.Boolean,
  expiresAt: IsoTimeSchema,
  host: Schema.String,
  userCode: UserCodeSchema,
});

const LoginRequestResponseSchema = matchesWire<LoginRequestResponse>()(
  Schema.Struct({ loginRequest: LoginRequestViewSchema }),
);

const LogoutResponseSchema = matchesWire<LogoutResponse>()(Schema.Struct({ revoked: Schema.Boolean }));

const SessionKindSchema = Schema.Literals(["web", "cli"]);

const PublicIdSchema = Schema.String.pipe(Schema.refine(isPublicId, { identifier: "PublicId" }));

const MadeBySchema = Schema.Struct({
  kind: Schema.Literals(["web", "cli", "identity token"]),
  where: Schema.optionalKey(Schema.String),
});

const SessionViewSchema = Schema.Struct({
  current: Schema.Boolean,
  expiresAt: IsoTimeSchema,
  id: PublicIdSchema,
  kind: SessionKindSchema,
  lastUsedAt: IsoTimeSchema,
  madeAt: IsoTimeSchema,
  madeBy: Schema.optionalKey(MadeBySchema),
  where: Schema.String,
});

const ListSessionsResponseSchema = matchesWire<ListSessionsResponse>()(
  Schema.Struct({ sessions: Schema.Array(SessionViewSchema) }),
);

const LogOutEverywhereCountsSchema = Schema.Struct({
  agentSessions: Schema.Int,
  joinCodes: Schema.Int,
  sessions: Schema.Int,
});

const LogOutEverywherePreviewSchema = matchesWire<LogOutEverywherePreview>()(
  Schema.Struct({ willEnd: LogOutEverywhereCountsSchema }),
);

const LogOutEverywhereResponseSchema = matchesWire<LogOutEverywhereResponse>()(
  Schema.Struct({ ended: LogOutEverywhereCountsSchema }),
);

const RevokeSessionResponseSchema = matchesWire<RevokeSessionResponse>()(Schema.Struct({ ended: Schema.Int }));

export {
  approvalRequestDetailsFields,
  CollectLoginRequestSchema,
  ListSessionsResponseSchema,
  LogOutEverywherePreviewSchema,
  LogOutEverywhereResponseSchema,
  RevokeSessionResponseSchema,
  LoginCollectedResponseSchema,
  LoginRequestResponseSchema,
  LoginRequestStartedResponseSchema,
  LogoutResponseSchema,
  StartLoginRequestSchema,
  WebLoginCollectedResponseSchema,
};
