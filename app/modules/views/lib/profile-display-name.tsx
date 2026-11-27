import type { Identity, IdentityName } from "../../sdk/index.ts";
import type { Composer } from "../../composer/index.ts";
import { DisplayNameField } from "./display-name-field.tsx";
import type { ReactNode } from "react";
import { namesEditableBy } from "./profile-rights.ts";

const TEXT = { displayName: "Display name" } as const;

interface ProfileDisplayNameProps {
  readonly composer: Composer;
  readonly identity: Identity;
  readonly me: IdentityName;
}

export function ProfileDisplayName(props: ProfileDisplayNameProps): ReactNode {
  const { identity } = props;
  if (!namesEditableBy({ identity, me: props.me })) {
    return null;
  }
  return (
    <DisplayNameField
      draft={props.composer.displayName(identity.name)}
      field={TEXT.displayName}
      label={TEXT.displayName}
      saved={identity.displayName ?? null}
    />
  );
}
