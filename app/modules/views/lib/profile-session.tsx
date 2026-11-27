import { ButtonRow } from "../../design-system/controls.tsx";
import type { IdentityActions } from "../../composer/index.ts";
import type { ListedAgentSession } from "../../sdk/index.ts";
import { ProfileSection } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { RevokeButton } from "./revoke-button.tsx";
import { SessionLine } from "./session-line.tsx";
import { useSyncExternalStore } from "react";

const NONE = 0;
const NO_SESSIONS: readonly ListedAgentSession[] = [];

const TEXT = { section: "Session" } as const;

interface ProfileSessionProps {
  readonly actions: IdentityActions;
  readonly active: boolean;
}

export function ProfileSession(props: ProfileSessionProps): ReactNode {
  const { actions } = props;
  const state = useSyncExternalStore(actions.subscribe, actions.snapshot);
  const live = (state.sessions ?? NO_SESSIONS).length > NONE;
  return (
    <ProfileSection label={TEXT.section}>
      <SessionLine actions={actions} />
      {props.active && live && (
        <ButtonRow>
          <RevokeButton actions={actions} />
        </ButtonRow>
      )}
    </ProfileSection>
  );
}
