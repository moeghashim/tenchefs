import type { AgentIdentity, DisplayName, Identity, IdentityName } from "../../../identities/index.ts";
import { DateTime, Effect, Option, Predicate } from "effect";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import {
  agentNotFound,
  displayNameOnExistingAgent,
  displayNameRequired,
  identityDeactivated,
  joinNotOwned,
  notBroughtIn,
  notYourIdentity,
  onlyAgentsJoin,
} from "./refusals.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Secrets } from "../../../secrets/server.ts";
import { isIdentityName } from "../../../identities/index.ts";
import { isoTimeOf } from "../../../time/server.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

interface Resolved {
  readonly identity: Identity;
  readonly created: boolean;
}

interface On {
  readonly publishIdentity: (identity: Identity) => Effect.Effect<void>;
  readonly secrets: Secrets["Service"];
  readonly storage: Storage["Service"];
}

interface Naming {
  readonly displayName?: DisplayName;
}

interface Asked {
  readonly on: On;
  readonly owner: IdentityName;
  readonly name: IdentityName;
  readonly naming: Naming;
  readonly missing: (asked: Asked) => Fails<Resolved>;
}

const UNNAMED: Naming = {};

type Taken = (found: Identity) => Fails<Resolved>;

type CreateResult = Effect.Success<ReturnType<Storage["Service"]["createIdentity"]>>;

const CONFLICT = 409;

function createRefusals(name: IdentityName): Readonly<Record<Exclude<CreateResult, "created">, Refusal>> {
  return {
    name_not_owned: joinNotOwned(name),
    name_taken: { code: "identity_exists", message: `The name ${name} is taken.`, status: CONFLICT },
    owner_not_human: joinNotOwned(name),
  };
}

function ownedBy(owner: IdentityName, found: Identity): found is AgentIdentity {
  return found.kind === "agent" && found.owner === owner;
}

function joinOwned(found: AgentIdentity, naming: Naming): Fails<Resolved> {
  if (Predicate.isNotUndefined(naming.displayName)) {
    return Effect.fail(displayNameOnExistingAgent(found.name));
  }
  if (found.deactivated === true) {
    return Effect.fail(identityDeactivated(found.name));
  }
  return Effect.succeed({ created: false, identity: found });
}

function createOwned(asked: Asked): Fails<Resolved> {
  const { name, naming, on, owner } = asked;
  const { displayName } = naming;
  if (Predicate.isUndefined(displayName)) {
    return Effect.fail(displayNameRequired(name));
  }
  return Effect.gen(function* createOwnedAgent() {
    const now = yield* DateTime.now;
    const identity: AgentIdentity = {
      admin: false,
      createdAt: isoTimeOf(now),
      displayName,
      kind: "agent",
      name,
      owner,
    };
    const hash = yield* Effect.flatMap(on.secrets.newToken, on.secrets.hashToken);
    const result = yield* on.storage.createIdentity(identity, hash);
    if (result !== "created") {
      return yield* Effect.fail(createRefusals(name)[result]);
    }
    yield* on.publishIdentity(identity);
    return { created: true, identity };
  });
}

function joinOrCreate(asked: Asked, taken: Taken): Fails<Resolved> {
  return Effect.flatMap(asked.on.storage.findIdentityByName(asked.name), (found) => {
    if (Predicate.isUndefined(found)) {
      return asked.missing(asked);
    }
    if (ownedBy(asked.owner, found)) {
      return joinOwned(found, asked.naming);
    }
    return taken(found);
  });
}

function refuseTaken(found: Identity): Fails<Resolved> {
  return Effect.fail(joinNotOwned(found.name));
}

function orInOwnNamespace(asked: Asked, namespaced: IdentityName): Taken {
  return (found) => {
    if (found.kind === "human") {
      return Effect.fail(onlyAgentsJoin(found.name));
    }
    return joinOrCreate({ ...asked, name: namespaced }, refuseTaken);
  };
}

function resolveAgent(asked: Asked): Fails<Resolved> {
  const namespaced = Option.liftPredicate(`${asked.owner}/${asked.name}`, isIdentityName);
  return Option.match(namespaced, {
    onNone: () => joinOrCreate(asked, refuseTaken),
    onSome: (name) => joinOrCreate(asked, orInOwnNamespace(asked, name)),
  });
}

interface Join {
  readonly on: On;
  readonly caller: Identity;
  readonly as: IdentityName;
  readonly naming: Naming;
}

function agentToJoin(join: Join): Fails<Resolved> {
  const { as, caller, naming, on } = join;
  if (caller.kind === "human") {
    return resolveAgent({ missing: createOwned, name: as, naming, on, owner: caller.name });
  }
  if (as !== caller.name) {
    return Effect.fail(notYourIdentity({ asked: as, caller: caller.name }));
  }
  if (Predicate.isNotUndefined(naming.displayName)) {
    return Effect.fail(displayNameOnExistingAgent(caller.name));
  }
  return Effect.succeed({ created: false, identity: caller });
}

interface Preview {
  readonly on: On;
  readonly caller: Identity;
  readonly as: IdentityName;
}

function refuseUnlessBroughtIn(approver: AgentIdentity): Taken {
  return (found) => {
    if (found.kind === "human") {
      return Effect.fail(onlyAgentsJoin(found.name));
    }
    if (found.owner !== approver.owner) {
      return Effect.fail(joinNotOwned(found.name));
    }
    if (found.broughtInBy !== approver.name) {
      return Effect.fail(notBroughtIn(found.name));
    }
    return joinOwned(found, UNNAMED);
  };
}

function refuseMissing({ name }: Asked): Fails<Resolved> {
  return Effect.fail(agentNotFound(name));
}

function resolveForAgent(approver: AgentIdentity, { as, on }: Preview): Fails<Resolved> {
  return Effect.flatMap(on.storage.findIdentityByName(as), (found) => {
    if (Predicate.isUndefined(found)) {
      return Effect.fail(agentNotFound(as));
    }
    return refuseUnlessBroughtIn(approver)(found);
  });
}

function agentToApprove(request: Preview): Fails<Resolved> {
  const { as, caller, on } = request;
  if (caller.kind === "agent") {
    return resolveForAgent(caller, request);
  }
  return resolveAgent({ missing: refuseMissing, name: as, naming: UNNAMED, on, owner: caller.name });
}

export { agentToApprove, agentToJoin };
