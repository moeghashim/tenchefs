import type { Identity, IdentityName } from "../../sdk/index.ts";
import { AvatarChoiceField } from "./avatar-choice-field.tsx";
import type { Composer } from "../../composer/index.ts";
import type { ReactNode } from "react";

interface ProfileAvatarProps {
  readonly composer: Composer;
  readonly identity: Identity;
  readonly me: IdentityName;
}

function settableBy(identity: Identity, me: IdentityName): boolean {
  if (identity.name === me) {
    return true;
  }
  return identity.kind === "agent" && identity.owner === String(me);
}

export function ProfileAvatar(props: ProfileAvatarProps): ReactNode {
  const { identity } = props;
  if (!settableBy(identity, props.me)) {
    return null;
  }
  return <AvatarChoiceField agent={identity.kind === "agent"} choice={props.composer.avatar(identity.name)} />;
}
