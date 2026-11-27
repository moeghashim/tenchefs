import type { InboxThreadSelection, LinkedRoute } from "../../paths/index.ts";
import type { PanelAction, PanelEdgeParts, ShortcutLinkParts } from "../../design-system/layout.tsx";
import type { Reader, Reading, Unread } from "../../unread/index.ts";
import type { Composer } from "../../composer/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import type { ThreadMessagesState } from "../../board/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { isThreadDeleted } from "./thread-deleted.ts";
import { threadHeading } from "./thread-heading.ts";

const TEXT = { markRead: "Mark read", markUnread: "Mark unread", readName: "Mark conversation read" } as const;

const NONE = 0;
const INBOX_HREF = hrefOf({ name: "inbox", selected: null });
const NOT_FOUND = "message_not_found";

interface ConversationProps {
  readonly composer: Composer;
  readonly edge: PanelEdgeParts;
  readonly selected: InboxThreadSelection;
  readonly unread: Unread;
  readonly reading: Reading;
  readonly me: string;
  readonly keymap: Keymap;
}

interface Actions {
  readonly reader: Reader;
  readonly keymap: Keymap;
}

interface OpenLink {
  readonly to: LinkedRoute;
  readonly label: string;
  readonly keymap: Keymap;
}

function actionsOf({ keymap, reader }: Actions): readonly PanelAction[] {
  return [
    {
      label: TEXT.markRead,
      name: TEXT.readName,
      onAction: reader.markRead,
      shortcut: keymap.shortcutOf("markRowRead"),
    },
    { label: TEXT.markUnread, onAction: reader.markUnread, shortcut: keymap.shortcutOf("markRowUnread") },
  ];
}

function openLinkOf({ keymap, label, to }: OpenLink): ShortcutLinkParts {
  return { href: hrefOf(to), label, shortcut: keymap.shortcutOf("openRow") };
}

function countOf(state: ThreadMessagesState): number {
  if (state.status !== "loaded") {
    return NONE;
  }
  return state.replies.length;
}

interface Headed {
  readonly selected: InboxThreadSelection;
  readonly state: ThreadMessagesState;
}

function titleOf({ selected, state }: Headed): string | null {
  return threadHeading({ channel: selected.channel, state }).title;
}

function detailOf({ selected, state }: Headed): string {
  return threadHeading({ channel: selected.channel, state }).detail;
}

type ConversationShape = "missing" | "deleted" | "shown";

function shapeOf(state: ThreadMessagesState): ConversationShape {
  if (state.status === "failed" && state.code === NOT_FOUND) {
    return "missing";
  }
  if (isThreadDeleted(state)) {
    return "deleted";
  }
  return "shown";
}

export { type ConversationProps, INBOX_HREF, actionsOf, countOf, detailOf, openLinkOf, shapeOf, titleOf };
