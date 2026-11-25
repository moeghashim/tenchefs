import type { Identity, IdentityName } from "../../sdk/index.ts";
import { IdentityRow } from "../../design-system/content.tsx";
import { IdentityTags } from "./identity-tags.tsx";
import type { ReactNode } from "react";
import { noteOf as deactivatedNote } from "./use-author.ts";
import { kindOf } from "./kind-of.ts";
import { usePresence } from "./use-presence.ts";
import { useProfileHref } from "./profile-base.ts";

const TEXT = { you: "(you)" } as const;

interface PersonRowProps {
  readonly identity: Identity;
  readonly me: IdentityName;
  readonly open: IdentityName | null;
  readonly tabbable: boolean;
}

function noteOf(identity: Identity, me: IdentityName): string | null {
  if (identity.name === me) {
    return TEXT.you;
  }
  return deactivatedNote(identity);
}

export function PersonRow(props: PersonRowProps): ReactNode {
  const { identity } = props;
  const profileOf = useProfileHref();
  return (
    <IdentityRow
      active={identity.name === props.open}
      agent={identity.kind === "agent"}
      detail={kindOf(identity)}
      displayName={identity.displayName ?? null}
      href={profileOf(identity.name)}
      name={identity.name}
      note={noteOf(identity, props.me)}
      presence={usePresence(identity.name)}
      tabbable={props.tabbable}
    >
      <IdentityTags identity={identity} />
    </IdentityRow>
  );
}
