import type { Identities, IdentityActions } from "../../composer/index.ts";
import { useCallback, useMemo } from "react";
import { ButtonRow } from "../../design-system/controls.tsx";
import type { DeactivatedQuietAgent } from "../../sdk/index.ts";
import { DeactivatedQuietAgentRow } from "./deactivated-quiet-agent-row.tsx";
import type { DeactivatedQuietAgents } from "../../unread/index.ts";
import { IdentityConfirm } from "./identity-confirm.tsx";
import type { ReactNode } from "react";
import { ReactivateRefusal } from "./reactivate-refusal.tsx";
import { RowButton } from "../../design-system/feed.tsx";
import { TokenShown } from "./token-shown.tsx";

const TEXT = { markRead: "Mark read", reactivate: "Reactivate" } as const;

function holdOnceReactivated(actions: Pick<IdentityActions, "snapshot" | "subscribe">, hold: () => void): void {
  const stop = actions.subscribe(() => {
    const { action, confirming, token } = actions.snapshot();
    if (action.status === "failed" || confirming === null) {
      stop();
    }
    if (confirming === null && token !== null) {
      hold();
    }
  });
}

interface UnreadDeactivatedQuietAgentRowProps {
  readonly entry: DeactivatedQuietAgent;
  readonly entries: Pick<DeactivatedQuietAgents, "hold" | "markRead" | "release">;
  readonly identities: Pick<Identities, "actions">;
}

export function UnreadDeactivatedQuietAgentRow(props: UnreadDeactivatedQuietAgentRowProps): ReactNode {
  const { entries, entry } = props;
  const shared = props.identities.actions(entry.identity.name);
  const actions = useMemo(
    () => ({
      ...shared,
      confirm: (): void => {
        shared.confirm();
        holdOnceReactivated(shared, () => {
          entries.hold(entry.id);
        });
      },
      forgetToken: (): void => {
        shared.forgetToken();
        entries.release(entry.id);
      },
    }),
    [entries, entry, shared],
  );
  const handleReactivate = actions.ask.reactivate;
  const handleMarkRead = useCallback(() => {
    entries.release(entry.id);
    entries.markRead(entry.id);
  }, [entries, entry]);
  return (
    <DeactivatedQuietAgentRow entry={entry}>
      {!entry.read && (
        <ButtonRow>
          <RowButton onClick={handleReactivate}>{TEXT.reactivate}</RowButton>
          <RowButton onClick={handleMarkRead}>{TEXT.markRead}</RowButton>
        </ButtonRow>
      )}
      <ReactivateRefusal actions={actions} />
      <TokenShown actions={actions} />
      <IdentityConfirm actions={actions} identity={entry.identity} />
    </DeactivatedQuietAgentRow>
  );
}
