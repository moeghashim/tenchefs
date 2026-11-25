import type { IdentityName, Token } from "../../sdk/index.ts";
import type { AgentCreation } from "./agent-creation.ts";
import type { IdentityActions } from "./identity-actions.ts";
import type { IdentityList } from "./identity-list.ts";
import { createAgentCreation } from "./agent-creation.ts";
import { createIdentityActions } from "./identity-actions.ts";

interface OwnerPowers {
  readonly actions: (name: IdentityName) => IdentityActions;
  readonly creation: AgentCreation;
}

function ownerPowersOf(list: IdentityList): OwnerPowers {
  const stores = new Map<string, IdentityActions>();
  function actions(name: IdentityName): IdentityActions {
    const store = stores.get(name) ?? createIdentityActions({ list, name });
    stores.set(name, store);
    return store;
  }
  function created(name: IdentityName, token: Token): void {
    actions(name).showToken(token);
  }
  return { actions, creation: createAgentCreation({ created, list }) };
}

export type { AgentCreation } from "./agent-creation.ts";
export type { IdentityActions } from "./identity-actions.ts";
export { ownerPowersOf };
