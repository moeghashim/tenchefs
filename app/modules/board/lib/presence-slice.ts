import type { CookoutClient, CookoutEvent, IdentityName, Presence } from "../../sdk/index.ts";
import type { Slice } from "./slice.ts";

type Presences = ReadonlyMap<IdentityName, Presence>;

type PresenceClient = Pick<CookoutClient, "presence">;

const NOBODY: Presences = new Map();

function withPresence(presences: Presences, presence: Presence): Presences {
  const held = presences.get(presence.identity) ?? null;
  if (held !== null && JSON.stringify(held) === JSON.stringify(presence)) {
    return presences;
  }
  return new Map(presences).set(presence.identity, presence);
}

function withoutIdentity(presences: Presences, name: IdentityName): Presences {
  if (!presences.has(name)) {
    return presences;
  }
  const left = new Map(presences);
  left.delete(name);
  return left;
}

function applied(presences: Presences, event: CookoutEvent): Presences {
  if (event.type === "identity-deleted") {
    return withoutIdentity(presences, event.identity.name);
  }
  if (event.type !== "presence") {
    return presences;
  }
  return withPresence(presences, event.presence);
}

const presenceSlice: Slice<Presences, PresenceClient> = {
  apply: applied,
  empty: NOBODY,
  read: async (client) => {
    const loaded = await client.presence();
    return new Map(loaded.presence.map((presence) => [presence.identity, presence]));
  },
};

export { type PresenceClient, type Presences, presenceSlice };
