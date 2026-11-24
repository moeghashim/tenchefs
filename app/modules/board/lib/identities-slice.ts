import type { CookoutClient, CookoutEvent, Identity, IdentityName } from "../../sdk/index.ts";
import type { Slice } from "./slice.ts";

interface Identities {
  readonly listed: readonly Identity[];
  readonly deleted: ReadonlySet<IdentityName>;
}

interface IdentityRemoved {
  readonly type: "identity-removed";
  readonly name: IdentityName;
}

type IdentityChange = CookoutEvent | IdentityRemoved;

type IdentitiesClient = Pick<CookoutClient, "listIdentities">;

const NOBODY: Identities = { deleted: new Set(), listed: [] };

function sorted(identities: readonly Identity[]): readonly Identity[] {
  return identities.toSorted((first, second) => first.name.localeCompare(second.name));
}

function heldAs(identities: Identities, name: IdentityName): Identity | null {
  return identities.listed.find((identity) => identity.name === name) ?? null;
}

function without(identities: Identities, name: IdentityName): readonly Identity[] {
  return identities.listed.filter((identity) => identity.name !== name);
}

function withIdentity(identities: Identities, identity: Identity): Identities {
  const held = heldAs(identities, identity.name);
  const sameHeld = held !== null && JSON.stringify(held) === JSON.stringify(identity);
  if (sameHeld && !identities.deleted.has(identity.name)) {
    return identities;
  }
  const deleted = new Set(identities.deleted);
  deleted.delete(identity.name);
  return { deleted, listed: sorted([...without(identities, identity.name), identity]) };
}

function removed(identities: Identities, name: IdentityName): Identities {
  if (heldAs(identities, name) === null) {
    return identities;
  }
  return { ...identities, listed: without(identities, name) };
}

function deletedElsewhere(identities: Identities, name: IdentityName): Identities {
  const left = removed(identities, name);
  if (identities.deleted.has(name)) {
    return left;
  }
  return { deleted: new Set(identities.deleted).add(name), listed: left.listed };
}

function applied(identities: Identities, change: IdentityChange): Identities {
  if (change.type === "identity") {
    return withIdentity(identities, change.identity);
  }
  if (change.type === "identity-deleted") {
    return deletedElsewhere(identities, change.identity.name);
  }
  if (change.type === "identity-removed") {
    return removed(identities, change.name);
  }
  return identities;
}

const identitiesSlice: Slice<Identities, IdentitiesClient, IdentityChange> = {
  apply: applied,
  empty: NOBODY,
  read: async (client) => {
    const loaded = await client.listIdentities({ include: "deactivated" });
    return { deleted: new Set(), listed: sorted(loaded.identities) };
  },
};

export { type Identities, type IdentitiesClient, type IdentityChange, identitiesSlice };
