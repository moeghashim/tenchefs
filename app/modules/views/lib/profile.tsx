import type { Composer } from "../../composer/index.ts";
import type { IdentityName } from "../../sdk/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import { ProfileBody } from "./profile-body.tsx";
import type { ReactNode } from "react";
import { SidePanel } from "../../design-system/layout.tsx";
import { useProfileKeys } from "./use-profile-keys.ts";

const TEXT = { close: "Close profile", profile: "Profile" } as const;

interface ProfileProps {
  readonly closeHref: string;
  readonly composer: Composer;
  readonly keymap: Keymap;
  readonly me: IdentityName;
  readonly name: IdentityName;
}

export function ProfileView(props: ProfileProps): ReactNode {
  useProfileKeys(props);

  return (
    <SidePanel closeHref={props.closeHref} closeLabel={TEXT.close} detail={props.name} edge={null} label={TEXT.profile}>
      <ProfileBody composer={props.composer} me={props.me} name={props.name} />
    </SidePanel>
  );
}
