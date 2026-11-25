import type { Act, Action, Keymap } from "../../keymap/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { isNarrowWindow } from "./narrow-window.ts";
import { useEffect } from "react";

const ROWS = "a[data-feed-row]";
const INBOX_ROW = "#/inbox/";
const CONTROLS = "a, button";
const REPLY_BOX = "textarea";
const FIRST = 0;
const STEPS = { next: 1, previous: -1 } as const;
const NOT_FOUND = -1;

interface InboxKeys {
  readonly keymap: Keymap;
  readonly selected: boolean;
  readonly conversation: string;
}

function rowAddresses(): readonly string[] {
  const addresses: string[] = [];
  for (const row of globalThis.document.querySelectorAll<HTMLAnchorElement>(ROWS)) {
    const href = row.hash;
    if (href.startsWith(INBOX_ROW) && !addresses.includes(href)) {
      addresses.push(href);
    }
  }
  return addresses;
}

function rowAt(address: string): string {
  return `${ROWS}[href="${address}"]`;
}

function inConversation(conversation: string, selector: string): string {
  return `aside[aria-label="${conversation}"] ${selector}`;
}

function focused(selector: string): boolean {
  const element = globalThis.document.querySelector<HTMLElement>(selector);
  if (element === null) {
    return false;
  }
  element.focus();
  return true;
}

function firstOf(step: "next" | "previous", addresses: readonly string[]): string | null {
  if (step === "previous") {
    return null;
  }
  return addresses[FIRST] ?? null;
}

function besideCurrent(step: "next" | "previous"): string | null {
  const addresses = rowAddresses();
  const at = addresses.indexOf(globalThis.location.hash);
  if (at === NOT_FOUND) {
    return firstOf(step, addresses);
  }
  return addresses[at + STEPS[step]] ?? null;
}

function select(step: "next" | "previous"): Act {
  return () => {
    const address = besideCurrent(step);
    if (address === null) {
      return false;
    }
    focused(rowAt(address));
    globalThis.location.hash = address;
    return true;
  };
}

function reply(conversation: string): Act {
  return ({ target }) => {
    if (target instanceof HTMLElement && target.matches(CONTROLS) && !target.matches(ROWS)) {
      return false;
    }
    return focused(inConversation(conversation, REPLY_BOX));
  };
}

function leaveTextBox({ target }: KeyboardEvent): boolean {
  if (target instanceof HTMLElement) {
    target.blur();
  }
  focused(rowAt(globalThis.location.hash));
  return true;
}

function back(selected: boolean): Act {
  return () => {
    if (!selected || !isNarrowWindow()) {
      return false;
    }
    globalThis.location.hash = hrefOf({ name: "inbox", selected: null });
    return true;
  };
}

function press({ conversation, keymap }: InboxKeys, action: Action): Act {
  return () => {
    const selector = inConversation(conversation, `[aria-keyshortcuts="${keymap.shortcutOf(action).keys}"]`);
    const button = globalThis.document.querySelector<HTMLElement>(selector);
    if (button === null) {
      return false;
    }
    button.click();
    return true;
  };
}

function useInboxKeys(keys: InboxKeys): void {
  const { conversation, keymap, selected } = keys;
  useEffect(() => {
    const unbindRows = keymap.bind({
      actions: {
        backToRows: back(selected),
        markRowRead: press({ conversation, keymap, selected }, "markRowRead"),
        markRowUnread: press({ conversation, keymap, selected }, "markRowUnread"),
        markSelectedRowRead: press({ conversation, keymap, selected }, "markRowRead"),
        nextRow: select("next"),
        openRow: press({ conversation, keymap, selected }, "openRow"),
        previousRow: select("previous"),
        replyToRow: reply(conversation),
      },
      scope: "inbox",
    });
    const unbindTextBox = keymap.bind({ actions: { leaveTextBox }, scope: "text box" });
    return (): void => {
      unbindRows();
      unbindTextBox();
    };
  }, [conversation, keymap, selected]);
}

export { type InboxKeys, useInboxKeys };
