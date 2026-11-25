import { Card, CardHeader } from "../../design-system/layout.tsx";
import { Heading, Muted } from "../../design-system/content.tsx";
import type { AgentJoinApproval } from "../../board/index.ts";
import { AgentJoinApprovalBody } from "./agent-join-approval-body.tsx";
import type { ReactNode } from "react";

const TEXT = {
  description:
    "Approve only if this code matches the one the box shows. The box then acts as an agent you own, never as you.",
  title: "Approve an agent join",
} as const;

interface AgentJoinApprovalProps {
  readonly approval: AgentJoinApproval;
}

export function AgentJoinApprovalView(props: AgentJoinApprovalProps): ReactNode {
  return (
    <Card>
      <CardHeader>
        <Heading>{TEXT.title}</Heading>
        <Muted>{TEXT.description}</Muted>
      </CardHeader>
      <AgentJoinApprovalBody approval={props.approval} />
    </Card>
  );
}
