import type { AgentJoinApproval, AgentJoinApprovalState } from "../../board/index.ts";
import { Alert, Button, CardBody, CheckField, InputField, Muted } from "../../design-system/index.tsx";
import type { ReactNode } from "react";

const TEXT = {
  approve: "Approve",
  code: "Code",
  idleExpiry: "Idle expiry",
  replace: "Replace its live session",
} as const;

type ShownState = Extract<AgentJoinApprovalState, { readonly idleExpiry: string }>;

interface AgentJoinRequestShownProps {
  readonly approval: AgentJoinApproval;
  readonly state: ShownState;
}

function becomes({ agentJoinRequest }: ShownState): string {
  if (agentJoinRequest.creates) {
    return `Creates ${agentJoinRequest.joins}, owned by you, and joins as it.`;
  }
  return `Joins as ${agentJoinRequest.joins}, which you own.`;
}

function liveNote({ agentJoinRequest }: ShownState): string | null {
  const live = agentJoinRequest.liveSessionExpiresAt ?? null;
  if (live === null) {
    return null;
  }
  return `${agentJoinRequest.joins} has a live session until ${live}. Approving replaces it only if you tick this.`;
}

function approvedText({ agentJoinRequest }: ShownState): string {
  return `Approved, with an idle expiry of ${agentJoinRequest.idleExpiry}. The box finishes joining now; you can close this page.`;
}

function refusalText({ refusal }: ShownState): string | null {
  if (refusal === null) {
    return null;
  }
  return `Couldn't approve (${refusal.code}): ${refusal.message}`;
}

export function AgentJoinRequestShown(props: AgentJoinRequestShownProps): ReactNode {
  const { approval, state } = props;
  const { agentJoinRequest } = state;
  const note = liveNote(state);
  const refused = refusalText(state);
  const handleIdleExpiry = approval.editIdleExpiry;
  const handleReplace = approval.editReplace;
  const handleApprove = approval.approve;
  return (
    <CardBody>
      <p aria-label={TEXT.code} className="font-mono text-2xl font-semibold tracking-widest">
        {agentJoinRequest.userCode}
      </p>
      <Muted>{`${agentJoinRequest.as} asks to join from ${agentJoinRequest.host}, until ${agentJoinRequest.expiresAt}.`}</Muted>
      <Muted>{becomes(state)}</Muted>
      <InputField
        error={null}
        help={`At most ${agentJoinRequest.idleExpiry}, as asked. You may lower it, such as 7d or 12h.`}
        kind="text"
        label={TEXT.idleExpiry}
        onEdit={handleIdleExpiry}
        required
        value={state.idleExpiry}
      />
      {note !== null && (
        <CheckField
          checked={state.replace}
          error={null}
          help={note}
          label={TEXT.replace}
          onEdit={handleReplace}
          required={false}
        />
      )}
      {refused !== null && <Alert>{refused}</Alert>}
      {state.status === "approved" && <Muted>{approvedText(state)}</Muted>}
      {state.status !== "approved" && (
        <Button disabled={state.status === "approving"} onClick={handleApprove}>
          {TEXT.approve}
        </Button>
      )}
    </CardBody>
  );
}
