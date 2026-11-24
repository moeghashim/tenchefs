import type { AgentIdentity, DisplayName, HumanIdentity, Identity, IdentityName } from "../../../identities/index.ts";
import { DateTime, Effect, Option, Predicate } from "effect";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import {
  displayNameOnExistingAgent,
  displayNameRequired,
  identityDeactivated,
  joinNotOwned,
  notYourIdentity,
  onlyAgentsJoin,
} from "./refusals.ts";
import { isIdentityName, nameFitsOwner } from "../../../identities/index.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Secrets } from "../../../secrets/server.ts";
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
  readonly requireDisplayName?: boolean;
}

interface Asked {
  readonly on: On;
  readonly caller: HumanIdentity;
  readonly name: IdentityName;
  readonly naming: Naming;
  readonly preview: boolean;
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

function ownedBy(caller: HumanIdentity, found: Identity): found is AgentIdentity {
  return found.kind === "agent" && found.owner === caller.name;
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

function previewed(identity: AgentIdentity): Fails<Resolved> {
  if (nameFitsOwner(identity)) {
    return Effect.succeed({ created: true, identity });
  }
  return Effect.fail(joinNotOwned(identity.name));
}

function named(identity: AgentIdentity, { displayName }: Naming): AgentIdentity {
  if (Predicate.isUndefined(displayName)) {
    return identity;
  }
  return { ...identity, displayName };
}

function createOwned(asked: Asked): Fails<Resolved> {
  const { caller, name, naming, on } = asked;
  if (naming.requireDisplayName === true && Predicate.isUndefined(naming.displayName)) {
    return Effect.fail(displayNameRequired(name));
  }
  return Effect.gen(function* createOwnedAgent() {
    const now = yield* DateTime.now;
    const identity = named(
      { admin: false, createdAt: isoTimeOf(now), kind: "agent", name, owner: caller.name },
      naming,
    );
    if (asked.preview) {
      return yield* previewed(identity);
    }
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
      return createOwned(asked);
    }
    if (ownedBy(asked.caller, found)) {
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
  const namespaced = Option.liftPredicate(`${asked.caller.name}/${asked.name}`, isIdentityName);
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
    return resolveAgent({ caller, name: as, naming, on, preview: false });
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
  readonly caller: HumanIdentity;
  readonly as: IdentityName;
}

function agentToPreview({ as, caller, on }: Preview): Fails<Resolved> {
  return resolveAgent({ caller, name: as, naming: UNNAMED, on, preview: true });
}

function agentToApprove({ as, caller, on }: Preview): Fails<Resolved> {
  return resolveAgent({ caller, name: as, naming: UNNAMED, on, preview: false });
}

export { agentToApprove, agentToJoin, agentToPreview };
