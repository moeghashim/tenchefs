import type { Identity, IdentityName } from "../../sdk/index.ts";
import { useCallback, useSyncExternalStore } from "react";
import { Alert } from "../../design-system/content.tsx";
import { Button } from "../../design-system/controls.tsx";
import type { Identities } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { adminChangeableBy } from "./profile-rights.ts";

const TEXT = { make: "Make admin", remove: "Remove admin" } as const;

interface AdminToggleProps {
  readonly identities: Identities;
  readonly identity: Identity;
  readonly me: IdentityName;
}

type AdminChange = ReturnType<Identities["adminChange"]>;

function labelOf(admin: boolean): string {
  if (admin) {
    return TEXT.remove;
  }
  return TEXT.make;
}

function refusalOf(change: AdminChange, name: IdentityName): string | null {
  if (change.status === "failed" && change.name === name) {
    return `Couldn't change admin (${change.code}): ${change.message}`;
  }
  return null;
}

export function AdminToggle(props: AdminToggleProps): ReactNode {
  const { identities, identity } = props;
  const listed = useSyncExternalStore(identities.subscribe, identities.snapshot);
  const change = useSyncExternalStore(identities.subscribe, identities.adminChange);
  const handleClick = useCallback(() => {
    identities.setAdmin(identity.name, !identity.admin);
  }, [identities, identity]);
  if (!adminChangeableBy({ identity, listed, me: props.me })) {
    return null;
  }
  const refusal = refusalOf(change, identity.name);
  return (
    <>
      <Button disabled={change.status === "changing"} onClick={handleClick}>
        {labelOf(identity.admin)}
      </Button>
      {refusal !== null && <Alert>{refusal}</Alert>}
    </>
  );
}
