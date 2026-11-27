import type { Identity, IdentityName } from "../../sdk/index.ts";
import type { Composer } from "../../composer/index.ts";
import { ProfileSection } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { TriggerForm } from "./trigger-form.tsx";
import { triggerEditableBy } from "./profile-rights.ts";

const TEXT = { section: "Wakes on mention" } as const;

interface ProfileTriggerProps {
  readonly composer: Composer;
  readonly identity: Identity;
  readonly me: IdentityName;
}

export function ProfileTrigger(props: ProfileTriggerProps): ReactNode {
  const { identity } = props;
  if (!triggerEditableBy({ identity, me: props.me })) {
    return null;
  }
  return (
    <ProfileSection label={TEXT.section}>
      <TriggerForm name={identity.name} settings={props.composer.trigger(identity.name)} />
    </ProfileSection>
  );
}
