import type { Board, ThreadMessagesState } from "../../board/index.ts";
import type { PanelAction, PanelEdgeParts } from "../../design-system/index.tsx";
import type { Reader, Reading, Unread } from "../../unread/index.ts";
import { CONVERSATION_KEYS } from "../../design-system/index.tsx";
import type { Composer } from "../../composer/index.ts";
import type { InboxThreadSelection } from "../../paths/index.ts";

const TEXT = { markRead: "Mark read", markUnread: "Mark unread", readName: "Mark conversation read" } as const;

const NONE = 0;
const NOT_FOUND = "message_not_found";

interface ConversationProps {
  readonly board: Board;
  readonly composer: Composer;
  readonly edge: PanelEdgeParts;
  readonly selected: InboxThreadSelection;
  readonly unread: Unread;
  readonly reading: Reading;
  readonly me: string;
}

function actionsOf(reader: Reader): readonly PanelAction[] {
  return [
    { label: TEXT.markRead, name: TEXT.readName, onAction: reader.markRead, shortcut: CONVERSATION_KEYS.read },
    { label: TEXT.markUnread, onAction: reader.markUnread, shortcut: CONVERSATION_KEYS.unread },
  ];
}

function countOf(state: ThreadMessagesState): number {
  if (state.status !== "loaded") {
    return NONE;
  }
  return state.replies.length;
}

function isMissing(state: ThreadMessagesState): boolean {
  return state.status === "failed" && state.code === NOT_FOUND;
}

export { type ConversationProps, actionsOf, countOf, isMissing };
