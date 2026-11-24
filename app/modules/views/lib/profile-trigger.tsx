import type { Identity, IdentityName } from "../../sdk/index.ts";
import type { Composer } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { TriggerForm } from "./trigger-form.tsx";

interface ProfileTriggerProps {
  readonly composer: Composer;
  readonly identity: Identity;
  readonly me: IdentityName;
}

function ownedBy(identity: Identity, me: IdentityName): boolean {
  return identity.kind === "agent" && identity.owner === String(me);
}

export function ProfileTrigger(props: ProfileTriggerProps): ReactNode {
  const { identity } = props;
  if (!ownedBy(identity, props.me)) {
    return null;
  }
  return <TriggerForm name={identity.name} settings={props.composer.trigger(identity.name)} />;
}
