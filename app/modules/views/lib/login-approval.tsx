import { Card, CardHeader } from "../../design-system/layout.tsx";
import { Heading, Muted } from "../../design-system/content.tsx";
import type { LoginApproval } from "../../board/index.ts";
import { LoginApprovalBody } from "./login-approval-body.tsx";
import type { ReactNode } from "react";

const TEXT = {
  description: "Approve only if this code matches the one your terminal shows. That machine then acts as you.",
  title: "Approve a login",
} as const;

interface LoginApprovalProps {
  readonly approval: LoginApproval;
}

export function LoginApprovalView(props: LoginApprovalProps): ReactNode {
  return (
    <Card>
      <CardHeader>
        <Heading>{TEXT.title}</Heading>
        <Muted>{TEXT.description}</Muted>
      </CardHeader>
      <LoginApprovalBody approval={props.approval} />
    </Card>
  );
}
