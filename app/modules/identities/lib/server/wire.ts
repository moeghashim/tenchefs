import type {
  DeactivateIdentityResponse,
  Identity,
  IdentityMessageCountResponse,
  IdentityResponse,
  IdentityWithTokenResponse,
  ListIdentitiesQuery,
  ListIdentitiesResponse,
  LoginLinkResponse,
} from "../../index.ts";
import { Schema, SchemaTransformation } from "effect";
import { avatarIdPattern, isAvatarId } from "../../../avatars/index.ts";
import { descriptionLength, isDescription } from "../../client.ts";
import {
  displayNameLength,
  identityNamePattern,
  isDisplayName,
  isIdentityName,
  isOwner,
  isToken,
  plainNamePattern,
  tokenPattern,
} from "../../index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import { matchesWire } from "../../../http/index.ts";

const IncludeDeactivatedSchema = Schema.optionalKey(Schema.Literal("deactivated"));

const NO_MESSAGES = 0;

const MessageCountSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(NO_MESSAGES));

export const IdentityNameSchema = Schema.String.check(
  Schema.isPattern(identityNamePattern, {
    message: "Use 1-64 lowercase letters, digits or '-', or two such parts joined by one '/'.",
  }),
).pipe(Schema.refine(isIdentityName, { identifier: "IdentityName" }));

export const OwnerSchema = Schema.String.check(
  Schema.isPattern(plainNamePattern, { message: "Use a human's name: 1-64 lowercase letters, digits or '-'." }),
).pipe(Schema.refine(isOwner, { identifier: "Owner" }));

const DisplayNameSchema = Schema.String.check(
  Schema.isTrimmed({ message: "Use no space at either end." }),
  Schema.isBetweenLength(displayNameLength.minimum, displayNameLength.maximum, { message: "Use 1-80 characters." }),
).pipe(Schema.refine(isDisplayName, { identifier: "DisplayName" }));

const SentDisplayNameSchema = Schema.String.pipe(Schema.decodeTo(DisplayNameSchema, SchemaTransformation.trim()));

const DescriptionSchema = Schema.String.check(
  Schema.isTrimmed({ message: "Use no space at either end." }),
  Schema.isBetweenLength(descriptionLength.minimum, descriptionLength.maximum, { message: "Use 1-500 characters." }),
).pipe(Schema.refine(isDescription, { identifier: "Description" }));

const SentDescriptionSchema = Schema.String.pipe(Schema.decodeTo(DescriptionSchema, SchemaTransformation.trim()));

const TokenSchema = Schema.String.check(Schema.isPattern(tokenPattern)).pipe(
  Schema.refine(isToken, { identifier: "Token" }),
);

const AvatarSchema = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(avatarIdPattern)).pipe(
    Schema.refine(isAvatarId, { identifier: "AvatarId" }),
  ),
});

const HumanIdentitySchema = Schema.Struct({
  admin: Schema.Boolean,
  avatar: Schema.optionalKey(AvatarSchema),
  createdAt: IsoTimeSchema,
  deactivated: Schema.optionalKey(Schema.Literal(true)),
  displayName: Schema.optionalKey(DisplayNameSchema),
  kind: Schema.Literal("human"),
  name: IdentityNameSchema,
});

export const AgentIdentitySchema = Schema.Struct({
  admin: Schema.Boolean,
  avatar: Schema.optionalKey(AvatarSchema),
  broughtInBy: Schema.optionalKey(IdentityNameSchema),
  createdAt: IsoTimeSchema,
  deactivated: Schema.optionalKey(Schema.Literal(true)),
  description: Schema.optionalKey(DescriptionSchema),
  displayName: Schema.optionalKey(DisplayNameSchema),
  handler: Schema.optionalKey(Schema.Literal(true)),
  kind: Schema.Literal("agent"),
  name: IdentityNameSchema,
  owner: OwnerSchema,
});

export const IdentitySchema = matchesWire<Identity>()(Schema.Union([HumanIdentitySchema, AgentIdentitySchema]));

export const IdentityResponseSchema = matchesWire<IdentityResponse>()(Schema.Struct({ identity: IdentitySchema }));

export const LoginLinkResponseSchema = matchesWire<LoginLinkResponse>()(
  Schema.Struct({ expiresAt: IsoTimeSchema, link: Schema.String }),
);

export const IdentityWithTokenResponseSchema = matchesWire<IdentityWithTokenResponse>()(
  Schema.Struct({
    identity: IdentitySchema,
    loginLink: Schema.optionalKey(LoginLinkResponseSchema),
    token: TokenSchema,
  }),
);

export const ListIdentitiesResponseSchema = matchesWire<ListIdentitiesResponse>()(
  Schema.Struct({ identities: Schema.Array(IdentitySchema) }),
);

export const DeactivateIdentityResponseSchema = matchesWire<DeactivateIdentityResponse>()(
  Schema.Struct({ identity: IdentitySchema }),
);

export const IdentityMessageCountResponseSchema = matchesWire<IdentityMessageCountResponse>()(
  Schema.Struct({ messages: MessageCountSchema }),
);

export const ListIdentitiesQuerySchema = matchesWire<ListIdentitiesQuery>()(
  Schema.Struct({ include: IncludeDeactivatedSchema }),
);

export { SentDescriptionSchema, SentDisplayNameSchema };
