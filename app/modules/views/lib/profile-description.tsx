import type { Identity, IdentityName } from "../../sdk/index.ts";
import { descriptionEditableBy, descriptionOf } from "./profile-rights.ts";
import type { Composer } from "../../composer/index.ts";
import { DescriptionField } from "./description-field.tsx";
import { MutedLines } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

interface ProfileDescriptionProps {
  readonly composer: Composer;
  readonly identity: Identity;
  readonly me: IdentityName;
}

export function ProfileDescription(props: ProfileDescriptionProps): ReactNode {
  const { identities } = props.composer;
  const { identity } = props;
  const listed = useSyncExternalStore(identities.subscribe, identities.snapshot);
  const saved = descriptionOf(identity);
  if (descriptionEditableBy({ identity, listed, me: props.me })) {
    return <DescriptionField draft={props.composer.description(identity.name)} saved={saved} />;
  }
  return saved !== null && <MutedLines>{saved}</MutedLines>;
}
