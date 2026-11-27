import type { Identity, IdentityName } from "../../sdk/index.ts";

interface Seen {
  readonly identity: Identity;
  readonly me: IdentityName;
}

interface Viewing extends Seen {
  readonly listed: readonly Identity[];
}

function isAdmin({ listed, me }: Viewing): boolean {
  return listed.some((each) => each.name === me && each.admin);
}

function ownsAgent({ identity, me }: Seen): boolean {
  return identity.kind === "agent" && identity.owner === String(me);
}

export function namesEditableBy(seen: Seen): boolean {
  return seen.identity.name === seen.me || ownsAgent(seen);
}

export function descriptionEditableBy(viewing: Viewing): boolean {
  return viewing.identity.kind === "agent" && (ownsAgent(viewing) || isAdmin(viewing));
}

export function triggerEditableBy(seen: Seen): boolean {
  return ownsAgent(seen);
}

export function actionableBy(viewing: Viewing): boolean {
  return viewing.identity.name !== viewing.me && (isAdmin(viewing) || ownsAgent(viewing));
}

export function adminChangeableBy(viewing: Viewing): boolean {
  return isAdmin(viewing) && viewing.identity.kind === "human";
}

export function deletableBy(viewing: Viewing): boolean {
  const owner = String(viewing.identity.name);
  return isAdmin(viewing) && !viewing.listed.some((each) => each.kind === "agent" && each.owner === owner);
}

export function transferableBy(viewing: Viewing): boolean {
  return viewing.identity.kind === "agent" && isAdmin(viewing);
}

export function descriptionOf(identity: Identity): string | null {
  if (identity.kind === "agent") {
    return identity.description ?? null;
  }
  return null;
}

export function overviewShownTo(viewing: Viewing): boolean {
  return namesEditableBy(viewing) || descriptionEditableBy(viewing) || descriptionOf(viewing.identity) !== null;
}
