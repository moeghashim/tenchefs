import { Alert, CardBody, Skeleton } from "../../design-system/index.tsx";
import type { AgentJoinApproval } from "../../board/index.ts";
import { AgentJoinRequestShown } from "./agent-join-request-shown.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

interface AgentJoinApprovalBodyProps {
  readonly approval: AgentJoinApproval;
}

export function AgentJoinApprovalBody(props: AgentJoinApprovalBodyProps): ReactNode {
  const { approval } = props;
  const state = useSyncExternalStore(approval.subscribe, approval.snapshot);
  if (state.status === "loading") {
    return (
      <CardBody>
        <Skeleton width="long" />
      </CardBody>
    );
  }
  if (state.status === "refused") {
    return (
      <CardBody>
        <Alert>{`Couldn't show this agent join request (${state.refusal.code}): ${state.refusal.message}`}</Alert>
      </CardBody>
    );
  }
  return <AgentJoinRequestShown approval={approval} state={state} />;
}
