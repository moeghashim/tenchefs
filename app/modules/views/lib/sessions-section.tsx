import { Button, ButtonRow } from "../../design-system/controls.tsx";
import { Alert } from "../../design-system/content.tsx";
import { LogOutButton } from "./log-out-button.tsx";
import type { ReactNode } from "react";
import { SessionCard } from "./session-card.tsx";
import type { SessionList } from "../../board/index.ts";
import { SessionsConfirm } from "./sessions-confirm.tsx";
import { alertOf } from "./sessions-words.ts";
import { useSyncExternalStore } from "react";

const TEXT = { everywhere: "Log out everywhere" } as const;

interface SessionsSectionProps {
  readonly sessionList: SessionList;
  readonly onLogOut: () => void;
}

export function SessionsSection(props: SessionsSectionProps): ReactNode {
  const { onLogOut, sessionList } = props;
  const state = useSyncExternalStore(sessionList.subscribe, sessionList.snapshot);
  const handleEverywhere = sessionList.askLogOutEverywhere;
  const failed = alertOf(state);
  return (
    <>
      {(state.sessions ?? []).map((session) => (
        <SessionCard key={session.id} onLogOut={onLogOut} session={session} sessionList={sessionList} />
      ))}
      {failed !== null && <Alert>{failed}</Alert>}
      <ButtonRow>
        <LogOutButton onLogOut={onLogOut} />
        <Button disabled={state.action.status === "sending"} onClick={handleEverywhere}>
          {TEXT.everywhere}
        </Button>
      </ButtonRow>
      <SessionsConfirm sessionList={sessionList} />
    </>
  );
}
