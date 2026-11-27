import type { Identity, IdentityName } from "../../sdk/index.ts";
import type { Composer } from "../../composer/index.ts";
import { ProfileDescription } from "./profile-description.tsx";
import { ProfileDisplayName } from "./profile-display-name.tsx";
import { ProfileSection } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { overviewShownTo } from "./profile-rights.ts";
import { useSyncExternalStore } from "react";

const TEXT = { section: "About" } as const;

interface ProfileOverviewProps {
  readonly composer: Composer;
  readonly identity: Identity;
  readonly me: IdentityName;
}

export function ProfileOverview(props: ProfileOverviewProps): ReactNode {
  const { identities } = props.composer;
  const listed = useSyncExternalStore(identities.subscribe, identities.snapshot);
  if (!overviewShownTo({ identity: props.identity, listed, me: props.me })) {
    return null;
  }
  return (
    <ProfileSection label={TEXT.section}>
      <ProfileDisplayName composer={props.composer} identity={props.identity} me={props.me} />
      <ProfileDescription composer={props.composer} identity={props.identity} me={props.me} />
    </ProfileSection>
  );
}
