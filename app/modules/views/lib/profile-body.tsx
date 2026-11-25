import { Muted, Skeleton } from "../../design-system/content.tsx";
import { CardBody } from "../../design-system/layout.tsx";
import type { Composer } from "../../composer/index.ts";
import type { IdentityName } from "../../sdk/index.ts";
import { ProfileEntry } from "./profile-entry.tsx";
import type { ReactNode } from "react";
import { usePresences } from "./use-presence.ts";
import { useSyncExternalStore } from "react";

const NONE = 0;

const TEXT = { unknown: "Unknown identity" } as const;

interface ProfileBodyProps {
  readonly composer: Composer;
  readonly me: IdentityName;
  readonly name: IdentityName;
}

export function ProfileBody(props: ProfileBodyProps): ReactNode {
  const { identities } = props.composer;
  const listed = useSyncExternalStore(identities.subscribe, identities.snapshot);
  const found = listed.filter((each) => each.name === props.name);
  const presences = usePresences();
  if (listed.length === NONE) {
    return (
      <CardBody>
        <Skeleton width="short" />
      </CardBody>
    );
  }
  if (found.length === NONE) {
    return (
      <CardBody>
        <Muted>{TEXT.unknown}</Muted>
      </CardBody>
    );
  }
  return found.map((identity) => (
    <ProfileEntry
      composer={props.composer}
      identity={identity}
      key={identity.name}
      me={props.me}
      presences={presences}
    />
  ));
}
