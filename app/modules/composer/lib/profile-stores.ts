import type { DisplayNameDraft } from "./display-name.ts";
import type { IdentityList } from "./identity-list.ts";
import type { IdentityName } from "../../sdk/index.ts";
import type { TriggerSettings } from "./trigger-settings.ts";
import { createDisplayName } from "./display-name.ts";
import { createTriggerSettings } from "./trigger-settings.ts";

interface ProfileStores {
  readonly displayName: (name: IdentityName) => DisplayNameDraft;
  readonly description: (name: IdentityName) => DisplayNameDraft;
  readonly trigger: (name: IdentityName) => TriggerSettings;
}

function cachedBy<Store>(make: (name: IdentityName) => Store): (name: IdentityName) => Store {
  const stores = new Map<string, Store>();
  return (name) => {
    const store = stores.get(name) ?? make(name);
    stores.set(name, store);
    return store;
  };
}

function profileStoresOf(list: IdentityList): ProfileStores {
  return {
    description: cachedBy((name) => createDisplayName({ list, name, set: list.calls.setDescription })),
    displayName: cachedBy((name) => createDisplayName({ list, name, set: list.calls.setDisplayName })),
    trigger: cachedBy((name) => createTriggerSettings({ calls: list.calls, name, show: list.show, store: list.store })),
  };
}

export { profileStoresOf };
export type { DisplayNameDraft } from "./display-name.ts";
export type { TriggerSettings } from "./trigger-settings.ts";
