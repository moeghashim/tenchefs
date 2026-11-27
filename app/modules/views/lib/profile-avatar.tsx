import type { Identity, IdentityName } from "../../sdk/index.ts";
import { AvatarChoiceField } from "./avatar-choice-field.tsx";
import type { Composer } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { namesEditableBy } from "./profile-rights.ts";

interface ProfileAvatarProps {
  readonly composer: Composer;
  readonly identity: Identity;
  readonly me: IdentityName;
}

export function ProfileAvatar(props: ProfileAvatarProps): ReactNode {
  const { identity } = props;
  if (!namesEditableBy({ identity, me: props.me })) {
    return null;
  }
  return <AvatarChoiceField agent={identity.kind === "agent"} choice={props.composer.avatar(identity.name)} />;
}
