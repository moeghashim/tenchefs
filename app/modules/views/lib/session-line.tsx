import type { IdentityActions } from "../../composer/index.ts";
import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { sessionText } from "./session-text.ts";
import { useSyncExternalStore } from "react";

interface SessionLineProps {
  readonly actions: IdentityActions;
}

export function SessionLine(props: SessionLineProps): ReactNode {
  const { actions } = props;
  const state = useSyncExternalStore(actions.subscribeToSessions, actions.snapshot);
  if (state.sessions === null) {
    return null;
  }
  return <Muted>{sessionText(state.sessions)}</Muted>;
}
