import type {
  AgentIdentity,
  HumanIdentity,
  Identity,
  IdentityKind,
  IdentityName,
  IdentityResponse,
  IdentityWithTokenResponse,
  Owner,
  TokenHash,
} from "../../index.ts";
import { DateTime, Effect, Predicate, Schema, String as Str } from "effect";
import { IdentityNameSchema, OwnerSchema, SentDescriptionSchema, SentDisplayNameSchema } from "./wire.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Secrets } from "../../../secrets/server.ts";
import { Storage } from "../../../storage/server.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import { identityKinds } from "../../index.ts";
import { isoTimeOf } from "../../../time/server.ts";
import { issueToken } from "./auth.ts";
import { loginLinkFor } from "./login-links.ts";

const humanHasNoOwner = Schema.makeFilter(
  (body: { readonly kind: IdentityKind; readonly owner?: Owner }) =>
    body.kind === "agent" || Predicate.isUndefined(body.owner) || { issue: "A human has no owner.", path: ["owner"] },
);

const humanNameIsPlain = Schema.makeFilter(
  (body: { readonly kind: IdentityKind; readonly name: IdentityName }) =>
    body.kind === "agent" || !Str.includes("/")(body.name) || { issue: "A human's name has no '/'.", path: ["name"] },
);

const humanHasNoDescription = Schema.makeFilter(
  (body: { readonly kind: IdentityKind; readonly description?: string }) =>
    body.kind === "agent" ||
    Predicate.isUndefined(body.description) || { issue: "Only an agent has a description.", path: ["description"] },
);

const CreateIdentityRequestSchema = Schema.Struct({
  description: Schema.optionalKey(SentDescriptionSchema),
  displayName: Schema.optionalKey(SentDisplayNameSchema),
  kind: Schema.Literals(identityKinds),
  name: IdentityNameSchema,
  owner: Schema.optionalKey(OwnerSchema),
}).check(humanHasNoOwner, humanNameIsPlain, humanHasNoDescription);

type CreateIdentityBody = typeof CreateIdentityRequestSchema.Type;

type Refused = "name_taken" | "name_not_owned" | "owner_not_human";

const BAD_REQUEST = 400;
const CONFLICT = 409;
const FORBIDDEN = 403;

const agentCreatesNoHuman: Refusal = {
  code: "human_only",
  message: "Only a human can create a human. An agent creates only agents, owned by its own owner.",
  status: FORBIDDEN,
};

const agentCreatesForOthers: Refusal = {
  code: "admin_only",
  message: "An agent creates agents only for its own owner. Leave out --owner, or name its owner.",
  status: FORBIDDEN,
};

const createsForOthers: Refusal = {
  code: "admin_only",
  message: "Only an admin can create a human, or an agent owned by someone else. Leave out --owner to own it yourself.",
  status: FORBIDDEN,
};

function displayNameRequired(name: IdentityName): Refusal {
  return {
    code: "display_name_required",
    message: `${name} would be a new agent, and a new agent needs a display name: send displayName (--display-name in the CLI).`,
    status: BAD_REQUEST,
  };
}

function identityExists(name: string): Refusal {
  return { code: "identity_exists", message: `The name ${name} is taken.`, status: CONFLICT };
}

function ownerNotHuman(owner: Owner): Refusal {
  return {
    code: "owner_not_human",
    details: { owner },
    message: `An agent's owner is a human, and there is no human named ${owner}.`,
    status: BAD_REQUEST,
  };
}

function nameNotOwned({ name }: Identity): Refusal {
  return {
    code: "name_not_owned",
    message: `${name} is namespaced: only an agent owned by the human named before its '/' can have it.`,
    status: BAD_REQUEST,
  };
}

function createRefusal(result: Refused, identity: Identity): Refusal {
  if (result === "name_taken") {
    return identityExists(identity.name);
  }
  if (result === "owner_not_human" && identity.kind === "agent") {
    return ownerNotHuman(identity.owner);
  }
  return nameNotOwned(identity);
}

function newIdentity(caller: HumanIdentity, body: CreateIdentityBody, createdAt: Identity["createdAt"]): Identity {
  const { kind, name, owner = caller.name } = body;
  const fields = { admin: false, createdAt, name };
  if (kind === "human") {
    return { ...fields, kind };
  }
  return { ...fields, kind, owner };
}

function withDisplayName(identity: Identity, { displayName }: CreateIdentityBody): Identity {
  if (Predicate.isUndefined(displayName)) {
    return identity;
  }
  return { ...identity, displayName };
}

function withDescription(identity: Identity, { description }: CreateIdentityBody): Identity {
  if (identity.kind === "human" || Predicate.isUndefined(description)) {
    return identity;
  }
  return { ...identity, description };
}

function requested(identity: Identity, body: CreateIdentityBody): Identity {
  return withDescription(withDisplayName(identity, body), body);
}

function agentBroughtInBy(
  caller: AgentIdentity,
  body: CreateIdentityBody,
  createdAt: Identity["createdAt"],
): Effect.Effect<Identity, Refusal> {
  const { kind, name, owner = caller.owner } = body;
  if (kind === "human") {
    return Effect.fail(agentCreatesNoHuman);
  }
  if (owner !== caller.owner) {
    return Effect.fail(agentCreatesForOthers);
  }
  return Effect.succeed({ admin: false, broughtInBy: caller.name, createdAt, kind, name, owner });
}

function requireMayCreate(caller: HumanIdentity, identity: Identity): Effect.Effect<void, Refusal> {
  if (caller.admin || (identity.kind === "agent" && identity.owner === caller.name)) {
    return Effect.void;
  }
  return Effect.fail(createsForOthers);
}

function requireAgentNamed(identity: Identity): Effect.Effect<void, Refusal> {
  if (identity.kind === "agent" && Predicate.isUndefined(identity.displayName)) {
    return Effect.fail(displayNameRequired(identity.name));
  }
  return Effect.void;
}

function storedOrRefused(result: "created" | Refused, identity: Identity): Effect.Effect<void, Refusal> {
  if (result === "created") {
    return Effect.void;
  }
  return Effect.fail(createRefusal(result, identity));
}

function storeNew(identity: Identity, hash: TokenHash): Effect.Effect<void, Refusal | StorageUnavailable, Storage> {
  return Effect.gen(function* storeNewIdentity() {
    const storage = yield* Storage;
    const result = yield* storage.createIdentity(identity, hash);
    yield* storedOrRefused(result, identity);
    if (identity.kind === "agent" && Predicate.isNotUndefined(identity.description)) {
      yield* storage.setDescription(identity.name, identity.description);
    }
  });
}

function withLoginLinkIfPerson(
  created: IdentityWithTokenResponse,
  origin: string,
): Effect.Effect<IdentityWithTokenResponse, StorageUnavailable, Storage | Secrets> {
  if (created.identity.kind !== "human") {
    return Effect.succeed(created);
  }
  return Effect.map(loginLinkFor({ name: created.identity.name, origin }), (loginLink) => ({ ...created, loginLink }));
}

function createIdentity(request: {
  readonly caller: HumanIdentity;
  readonly body: CreateIdentityBody;
  readonly origin: string;
}): Effect.Effect<IdentityWithTokenResponse, Refusal | StorageUnavailable, Storage | Secrets> {
  const { body, caller, origin } = request;
  return Effect.gen(function* createRequestedIdentity() {
    const now = yield* DateTime.now;
    const identity = requested(newIdentity(caller, body, isoTimeOf(now)), body);
    yield* requireMayCreate(caller, identity);
    yield* requireAgentNamed(identity);
    const { token, hash } = yield* issueToken;
    yield* storeNew(identity, hash);
    return yield* withLoginLinkIfPerson({ identity, token }, origin);
  });
}

function createAgentByAgent(request: {
  readonly caller: AgentIdentity;
  readonly body: CreateIdentityBody;
}): Effect.Effect<IdentityResponse, Refusal | StorageUnavailable, Storage | Secrets> {
  const { body, caller } = request;
  return Effect.gen(function* createBroughtInAgent() {
    const now = yield* DateTime.now;
    const brought = yield* agentBroughtInBy(caller, body, isoTimeOf(now));
    const identity = requested(brought, body);
    yield* requireAgentNamed(identity);
    const { hash } = yield* issueToken;
    yield* storeNew(identity, hash);
    return { identity };
  });
}

function humanAdmin(name: IdentityName): Effect.Effect<Identity> {
  return Effect.map(DateTime.now, (now) => ({
    admin: true,
    createdAt: isoTimeOf(now),
    kind: "human",
    name,
  }));
}

export { CreateIdentityRequestSchema, createAgentByAgent, createIdentity, humanAdmin, ownerNotHuman };
