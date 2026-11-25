import { Alert } from "../../design-system/content.tsx";
import type { IdentityActions } from "../../composer/index.ts";
import type { ReactNode } from "react";
import { refusalOf } from "./identity-questions.ts";
import { useSyncExternalStore } from "react";

interface ReactivateRefusalProps {
  readonly actions: IdentityActions;
}

export function ReactivateRefusal(props: ReactivateRefusalProps): ReactNode {
  const { actions } = props;
  const state = useSyncExternalStore(actions.subscribe, actions.snapshot);
  const refusal = refusalOf(state);
  return state.action.status === "failed" && state.action.action === "reactivate" && <Alert>{refusal}</Alert>;
}
