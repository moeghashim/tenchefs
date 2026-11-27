import type { ApprovalRequestDetails, ApprovalRequestKind } from "../../logins/index.ts";
import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useTimeAgo } from "./use-time-ago.ts";

const KINDS: Readonly<Record<ApprovalRequestKind, string>> = {
  agent_join: "agent join",
  browser: "browser login",
  terminal: "terminal login",
};

const NOT_RECORDED = "not recorded";

interface ApprovalRequestDetailsProps {
  readonly details: ApprovalRequestDetails;
}

export function ApprovalRequestDetailsView(props: ApprovalRequestDetailsProps): ReactNode {
  const { details } = props;
  const started = useTimeAgo(details.createdAt);
  return (
    <>
      <Muted>{`Kind: ${KINDS[details.kind]}`}</Muted>
      <Muted>{`From: ${details.where}`}</Muted>
      <Muted>{`IP address: ${details.clientIp ?? NOT_RECORDED}`}</Muted>
      <Muted>{`Started: ${started}`}</Muted>
    </>
  );
}
