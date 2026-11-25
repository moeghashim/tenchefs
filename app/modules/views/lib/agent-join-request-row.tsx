import { FeedNoticeRow, RowButton } from "../../design-system/feed.tsx";
import { useCallback, useSyncExternalStore } from "react";
import type { AgentJoinRequests } from "../../unread/index.ts";
import { Alert } from "../../design-system/content.tsx";
import { ButtonRow } from "../../design-system/controls.tsx";
import type { InboxAgentJoinRequest } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { useAuthor } from "./use-author.ts";
import { useTimeAgo } from "./use-time-ago.ts";

const TEXT = { approve: "Approve", dismiss: "Dismiss", replace: "Replace" } as const;

interface AgentJoinRequestRowProps {
  readonly request: InboxAgentJoinRequest;
  readonly requests: AgentJoinRequests;
}

function refusalText(requests: ReturnType<AgentJoinRequests["snapshot"]>, userCode: string): string | null {
  const refused = requests.refused.get(userCode) ?? null;
  if (refused === null) {
    return null;
  }
  return `Couldn't approve (${refused.code}): ${refused.message}`;
}

function whyText(request: InboxAgentJoinRequest): string {
  const live = request.liveSessionExpiresAt ?? null;
  if (live === null) {
    return request.text;
  }
  return (
    `${request.text} @${request.agent.name} is already joined in another session. ` +
    "Replace ends that session and joins this one; Dismiss clears this request."
  );
}

export function AgentJoinRequestRow(props: AgentJoinRequestRowProps): ReactNode {
  const { request, requests } = props;
  const state = useSyncExternalStore(requests.subscribe, requests.snapshot);
  const { agent, displayName, note, presence, profileHref } = useAuthor(request.agent);
  const time = useTimeAgo(request.createdAt);
  const handleApprove = useCallback(() => {
    requests.approve(request.userCode);
  }, [requests, request]);
  const handleReplace = useCallback(() => {
    requests.replace(request.userCode);
  }, [requests, request]);
  const handleDismiss = useCallback(() => {
    requests.dismiss(request.userCode);
  }, [requests, request]);
  const refused = refusalText(state, request.userCode);
  const live = Boolean(request.liveSessionExpiresAt);
  return (
    <FeedNoticeRow
      agent={agent}
      displayName={displayName}
      href={profileHref}
      level="for-you"
      name={request.agent.name}
      note={note}
      presence={presence}
      time={time}
      why={whyText(request)}
    >
      <ButtonRow>
        {!live && <RowButton onClick={handleApprove}>{TEXT.approve}</RowButton>}
        {live && <RowButton onClick={handleReplace}>{TEXT.replace}</RowButton>}
        <RowButton onClick={handleDismiss}>{TEXT.dismiss}</RowButton>
      </ButtonRow>
      {refused !== null && <Alert>{refused}</Alert>}
    </FeedNoticeRow>
  );
}
