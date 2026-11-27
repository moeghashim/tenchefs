import type { Identity, IdentityName } from "../../sdk/index.ts";
import { ProfileFrame, ProfileSections } from "../../design-system/content.tsx";
import type { Composer } from "../../composer/index.ts";
import { ProfileControls } from "./profile-controls.tsx";
import { ProfileHead } from "./profile-head.tsx";
import { ProfileOverview } from "./profile-overview.tsx";
import { ProfileTrigger } from "./profile-trigger.tsx";
import type { ReactNode } from "react";
import type { usePresences } from "./use-presence.ts";

interface ProfileEntryProps {
  readonly composer: Composer;
  readonly me: IdentityName;
  readonly identity: Identity;
  readonly presences: ReturnType<typeof usePresences>;
}

export function ProfileEntry(props: ProfileEntryProps): ReactNode {
  const { composer, identity, me } = props;
  return (
    <ProfileFrame>
      <ProfileHead composer={composer} identity={identity} me={me} presences={props.presences} />
      <ProfileSections>
        <ProfileOverview composer={composer} identity={identity} me={me} />
        <ProfileTrigger composer={composer} identity={identity} me={me} />
        <ProfileControls identities={composer.identities} identity={identity} me={me} />
      </ProfileSections>
    </ProfileFrame>
  );
}
