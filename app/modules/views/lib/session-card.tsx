import { ActionGroup, Button } from "../../design-system/controls.tsx";
import { Muted, Tag } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import type { SessionList } from "../../board/index.ts";
import type { SessionView } from "../../logins/index.ts";
import { sessionDetail } from "./sessions-words.ts";
import { useCallback } from "react";

const TEXT = { current: "This browser", revoke: "Revoke" } as const;

interface SessionCardProps {
  readonly session: SessionView;
  readonly sessionList: SessionList;
  readonly onLogOut: () => void;
}

export function SessionCard(props: SessionCardProps): ReactNode {
  const { onLogOut, session, sessionList } = props;
  const handleRevoke = useCallback(() => {
    if (session.current) {
      onLogOut();
      return;
    }
    sessionList.askRevoke(session);
  }, [onLogOut, session, sessionList]);
  return (
    <ActionGroup label={session.where}>
      {session.current && <Tag label={TEXT.current} />}
      <Muted>{sessionDetail(session)}</Muted>
      <Button onClick={handleRevoke}>{TEXT.revoke}</Button>
    </ActionGroup>
  );
}
