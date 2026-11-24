import type { Identity, IdentityName } from "../../sdk/index.ts";
import type { Composer } from "../../composer/index.ts";
import { ProfileDescription } from "./profile-description.tsx";
import { ProfileDisplayName } from "./profile-display-name.tsx";
import { ProfileTrigger } from "./profile-trigger.tsx";
import type { ReactNode } from "react";

interface ProfileTextsProps {
  readonly composer: Composer;
  readonly identity: Identity;
  readonly me: IdentityName;
}

export function ProfileTexts(props: ProfileTextsProps): ReactNode {
  return (
    <>
      <ProfileDisplayName composer={props.composer} identity={props.identity} me={props.me} />
      <ProfileDescription composer={props.composer} identity={props.identity} me={props.me} />
      <ProfileTrigger composer={props.composer} identity={props.identity} me={props.me} />
    </>
  );
}
