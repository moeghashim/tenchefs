import { ActionGroup } from "../../design-system/controls.tsx";
import type { Identities } from "../../composer/index.ts";
import type { Identity } from "../../sdk/index.ts";
import { IdentityActionsView } from "./identity-actions.tsx";
import { ProfileName } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { noteOf } from "./use-author.ts";

interface AgentCardProps {
  readonly identities: Identities;
  readonly identity: Identity;
}

export function AgentCard(props: AgentCardProps): ReactNode {
  const { identity } = props;
  return (
    <ActionGroup label={`@${identity.name}`}>
      <ProfileName displayName={identity.displayName ?? null} name={identity.name} note={noteOf(identity)} />
      <IdentityActionsView deletable={false} identities={props.identities} identity={identity} transfer={false} />
    </ActionGroup>
  );
}
