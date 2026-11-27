import type { AgentJoinApproval, AgentJoinApprovalState } from "../../board/index.ts";
import { Alert, Muted } from "../../design-system/content.tsx";
import { CheckField, InputField } from "../../design-system/controls.tsx";
import { AgentJoinRequestAnswers } from "./agent-join-request-answers.tsx";
import { ApprovalRequestDetailsView } from "./approval-request-details.tsx";
import { CardBody } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";

const TEXT = {
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
  return (
    `${agentJoinRequest.joins} is already joined in another session, until ${live}. ` +
    `Tick ${TEXT.replace} to end that session and join this one, or Dismiss this request.`
  );
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
  return (
    <CardBody>
      <ApprovalRequestDetailsView details={agentJoinRequest} />
      <Muted>{`${agentJoinRequest.as} asks to join, until ${agentJoinRequest.expiresAt}.`}</Muted>
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
      <AgentJoinRequestAnswers approval={approval} state={state} />
    </CardBody>
  );
}
