import type { Identity, IdentityName } from "../../sdk/index.ts";
import { deletableBy, transferableBy } from "./profile-rights.ts";
import { AdminToggle } from "./admin-toggle.tsx";
import type { Identities } from "../../composer/index.ts";
import { ManageActions } from "./manage-actions.tsx";
import { ProfileSection } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = { section: "Manage" } as const;

interface ProfileManageProps {
  readonly actionable: boolean;
  readonly identities: Identities;
  readonly identity: Identity;
  readonly me: IdentityName;
}

export function ProfileManage(props: ProfileManageProps): ReactNode {
  const { identities, identity, me } = props;
  const listed = useSyncExternalStore(identities.subscribe, identities.snapshot);
  const viewing = { identity, listed, me };
  return (
    <ProfileSection label={TEXT.section}>
      <AdminToggle identities={identities} identity={identity} me={me} />
      {props.actionable && (
        <ManageActions
          actions={identities.actions(identity.name)}
          deletable={deletableBy(viewing)}
          identity={identity}
          transfer={transferableBy(viewing)}
        />
      )}
    </ProfileSection>
  );
}
