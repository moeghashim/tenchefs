import type { AgentJoinApprovals, ApprovalCode, LoginApprovals } from "../../board/index.ts";
import { Card, CardBody, CardHeader } from "../../design-system/layout.tsx";
import { Heading, Muted } from "../../design-system/content.tsx";
import { ApprovalCodeForm } from "./approval-code-form.tsx";
import { ApprovalFound } from "./approval-found.tsx";
import type { ReactNode } from "react";

const TEXT = {
  description:
    "Type the code your new device shows. Never type a code someone sent you: approving lets that device act as you, or as an agent you own.",
  title: "Approve a device",
} as const;

interface ApprovalProps {
  readonly approvalCode: ApprovalCode;
  readonly agentJoinApprovals: AgentJoinApprovals;
  readonly loginApprovals: LoginApprovals;
}

export function ApprovalView(props: ApprovalProps): ReactNode {
  return (
    <Card>
      <CardHeader>
        <Heading>{TEXT.title}</Heading>
        <Muted>{TEXT.description}</Muted>
      </CardHeader>
      <CardBody>
        <ApprovalCodeForm approvalCode={props.approvalCode} />
      </CardBody>
      <ApprovalFound
        agentJoinApprovals={props.agentJoinApprovals}
        approvalCode={props.approvalCode}
        loginApprovals={props.loginApprovals}
      />
    </Card>
  );
}
