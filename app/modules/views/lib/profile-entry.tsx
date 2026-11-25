import type { Identity, IdentityName } from "../../sdk/index.ts";
import { Profile, ProfileName } from "../../design-system/content.tsx";
import type { Composer } from "../../composer/index.ts";
import { IdentityTags } from "./identity-tags.tsx";
import { ProfileControls } from "./profile-controls.tsx";
import { ProfileFacts } from "./profile-facts.tsx";
import { ProfileTexts } from "./profile-texts.tsx";
import type { ReactNode } from "react";
import { noteOf } from "./use-author.ts";
import { shownIn } from "./use-presence.ts";
import type { usePresences } from "./use-presence.ts";

interface ProfileEntryProps {
  readonly composer: Composer;
  readonly me: IdentityName;
  readonly identity: Identity;
  readonly presences: ReturnType<typeof usePresences>;
}

export function ProfileEntry(props: ProfileEntryProps): ReactNode {
  const { identity } = props;
  return (
    <Profile
      agent={identity.kind === "agent"}
      name={identity.name}
      presence={shownIn({ name: identity.name, presences: props.presences })}
    >
      <ProfileName displayName={identity.displayName ?? null} name={identity.name} note={noteOf(identity)}>
        <IdentityTags identity={identity} />
      </ProfileName>
      <ProfileFacts identity={identity} />
      <ProfileTexts composer={props.composer} identity={identity} me={props.me} />
      <ProfileControls identities={props.composer.identities} identity={identity} me={props.me} />
    </Profile>
  );
}
