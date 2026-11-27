import { DELETE_TEXT, outcomeWords, refusalWords, titleOf } from "./message-delete-words.ts";
import { useCallback, useContext } from "react";
import { Announcer } from "./announcer.ts";
import { ConfirmDialog } from "../../design-system/controls.tsx";
import type { Message } from "../../sdk/index.ts";
import type { MessageDeleting } from "../../board/index.ts";
import type { ReactNode } from "react";
import { useBoardStore } from "./use-board.ts";

interface MessageDeleteAskedProps {
  readonly asked: Message;
  readonly deleting: MessageDeleting;
}

export function MessageDeleteAsked(props: MessageDeleteAskedProps): ReactNode {
  const { asked, deleting } = props;
  const store = useBoardStore();
  const announce = useContext(Announcer);
  const handleCancel = store.calls.cancelDelete;
  const { deleteMessage } = store.calls;
  const handleConfirm = useCallback(() => {
    deleteMessage(asked.id, (outcome) => {
      announce(outcomeWords(outcome));
    });
  }, [announce, asked, deleteMessage]);
  return (
    <ConfirmDialog
      body={DELETE_TEXT.body}
      confirm={DELETE_TEXT.confirm}
      destructive
      error={refusalWords(deleting)}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
      open
      pending={deleting.pending}
      returnTo={null}
      title={titleOf(asked)}
    />
  );
}
