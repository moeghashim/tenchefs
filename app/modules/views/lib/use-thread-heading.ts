import type { ChannelName, MessageId, TopLevelMessage } from "../../sdk/index.ts";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Keymap } from "../../keymap/index.ts";
import type { PanelTitling } from "../../design-system/layout.tsx";
import type { ThreadMessagesState } from "../../board/index.ts";
import { threadHeading } from "./thread-heading.ts";
import { useBoardStore } from "./use-board.ts";

const TEXT = { add: "Add title", edit: "Edit title", field: "Title", form: "Thread title" } as const;
const FORM = `aside[aria-label="Thread"] form[aria-label="${TEXT.form}"]`;

interface Editing {
  readonly open: boolean;
  readonly text: string;
  readonly saving: boolean;
  readonly error: string | null;
  readonly returned: boolean;
}

const CLOSED: Editing = { error: null, open: false, returned: false, saving: false, text: "" };
const RETURNED: Editing = { ...CLOSED, returned: true };

interface HeadingOf {
  readonly channel: ChannelName;
  readonly gone: boolean;
  readonly keymap: Keymap;
  readonly state: ThreadMessagesState;
}

interface ThreadTitleHeading {
  readonly detail: string;
  readonly title: string | null;
  readonly titling: PanelTitling | null;
}

interface Saving {
  readonly id: MessageId;
  readonly text: string;
}

interface EditingCalls {
  readonly editing: Editing;
  readonly open: (title: string) => void;
  readonly write: (text: string) => void;
  readonly save: (saving: Saving) => Promise<void>;
}

function shownParent({ gone, state }: Pick<HeadingOf, "gone" | "state">): TopLevelMessage | null {
  if (state.status !== "loaded" || gone) {
    return null;
  }
  return state.parent;
}

function editLabel(parent: TopLevelMessage): string {
  if (typeof parent.title === "string") {
    return TEXT.edit;
  }
  return TEXT.add;
}

function useCancelKey(keymap: Keymap, cancel: () => void): void {
  useEffect(
    () =>
      keymap.bind({
        actions: {
          cancelTitle: () => {
            cancel();
            return true;
          },
        },
        scope: "title field",
        within: () => globalThis.document.querySelector(FORM),
      }),
    [cancel, keymap],
  );
}

function useEditing(keymap: Keymap): EditingCalls {
  const { setTitle } = useBoardStore().calls;
  const [editing, setEditing] = useState(CLOSED);
  const cancel = useCallback(() => {
    setEditing(RETURNED);
  }, []);
  useCancelKey(keymap, cancel);
  const open = useCallback((title: string) => {
    setEditing({ ...CLOSED, open: true, text: title });
  }, []);
  const write = useCallback((text: string) => {
    setEditing((before) => ({ ...before, error: null, text }));
  }, []);
  const save = useCallback(
    async ({ id, text }: Saving) => {
      setEditing((before) => ({ ...before, saving: true }));
      const refusal = await setTitle(id, text);
      if (refusal === null) {
        setEditing(RETURNED);
        return;
      }
      setEditing((before) => ({ ...before, error: refusal.message, saving: false }));
    },
    [setTitle],
  );
  return useMemo(() => ({ editing, open, save, write }), [editing, open, save, write]);
}

function titlingOf(parent: TopLevelMessage, { editing, open, save, write }: EditingCalls): PanelTitling {
  const edit = {
    focused: editing.returned,
    label: editLabel(parent),
    onEdit: (): void => {
      open(parent.title ?? "");
    },
  };
  if (!editing.open) {
    return { edit, field: null };
  }
  return {
    edit,
    field: {
      error: editing.error,
      field: TEXT.field,
      label: TEXT.form,
      onSave: async (): Promise<void> => {
        await save({ id: parent.id, text: editing.text });
      },
      onText: write,
      saving: editing.saving,
      text: editing.text,
    },
  };
}

function useThreadHeading({ channel, gone, keymap, state }: HeadingOf): ThreadTitleHeading {
  const calls = useEditing(keymap);
  return useMemo(() => {
    const heading = threadHeading({ channel, state });
    const parent = shownParent({ gone, state });
    if (parent === null) {
      return { ...heading, titling: null };
    }
    return { ...heading, titling: titlingOf(parent, calls) };
  }, [calls, channel, gone, state]);
}

export { type HeadingOf as ThreadHeadingOf, useThreadHeading };
