import { Alert, Skeleton } from "../../design-system/content.tsx";
import type { AgentJoinApproval } from "../../board/index.ts";
import { AgentJoinRequestShown } from "./agent-join-request-shown.tsx";
import { CardBody } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";
import type { Refusal } from "../../sdk/index.ts";
import { useSyncExternalStore } from "react";

const NOT_FOUND = "agent_join_request_not_found";

function refusalLine(refusal: Refusal, userCode: string): string {
  if (refusal.code === NOT_FOUND) {
    return (
      `No live request has the code ${userCode}. ` +
      "Check it against the new device, or start again there: a code lasts 10 minutes."
    );
  }
  return `Couldn't show this agent join request (${refusal.code}): ${refusal.message}`;
}

interface AgentJoinApprovalBodyProps {
  readonly approval: AgentJoinApproval;
  readonly userCode: string;
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
        <Alert>{refusalLine(state.refusal, props.userCode)}</Alert>
      </CardBody>
    );
  }
  return <AgentJoinRequestShown approval={approval} state={state} />;
}
