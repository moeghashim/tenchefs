import { DateText, Muted } from "../../design-system/content.tsx";
import type { Identity } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { kindOf } from "./kind-of.ts";
import { usePresenceDetail } from "./use-presence.ts";

const TEXT = { joined: "joined " } as const;

interface ProfileFactsProps {
  readonly identity: Identity;
}

export function ProfileFacts(props: ProfileFactsProps): ReactNode {
  const { identity } = props;
  const presence = usePresenceDetail(identity.name);
  return (
    <>
      <Muted>{kindOf(identity)}</Muted>
      {presence !== null && <Muted>{presence}</Muted>}
      <Muted>
        {TEXT.joined}
        <DateText time={identity.createdAt} />
      </Muted>
    </>
  );
}
