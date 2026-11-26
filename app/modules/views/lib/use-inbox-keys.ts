import type { Act, Action, Keymap } from "../../keymap/index.ts";
import { clickOn } from "./message-keys.ts";
import { hrefOf } from "../../paths/index.ts";
import { isNarrowWindow } from "./narrow-window.ts";
import { useEffect } from "react";

const ROWS = "a[data-feed-row]";
const INBOX_ROW = "#/inbox/";
const CONTROLS = "a, button";
const REPLY_BOX = "textarea";
const TOP_MESSAGE = 'article[aria-label="First message"]';
const FIRST = 0;
const STEPS = { next: 1, previous: -1 } as const;
const NOT_FOUND = -1;

interface InboxKeys {
  readonly keymap: Keymap;
  readonly selected: boolean;
  readonly conversation: string;
  readonly watch: (target: () => unknown) => void;
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

function currentAddress(): string {
  const focusedRow = globalThis.document.activeElement;
  if (focusedRow instanceof HTMLAnchorElement && focusedRow.matches(ROWS)) {
    return focusedRow.hash;
  }
  return globalThis.location.hash;
}

function besideCurrent(step: "next" | "previous"): string | null {
  const addresses = rowAddresses();
  const at = addresses.indexOf(currentAddress());
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

function onAControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches(CONTROLS) && !target.matches(ROWS);
}

function focusIn(conversation: string, selector: string): Act {
  return ({ target }) => !onAControl(target) && focused(inConversation(conversation, selector));
}

function onTopMessage({ conversation, keymap }: Pick<InboxKeys, "conversation" | "keymap">, action: Action): Act {
  const click = clickOn({
    action,
    keymap,
    messageOf: () => globalThis.document.querySelector(inConversation(conversation, TOP_MESSAGE)),
  });
  return (event) => !onAControl(event.target) && click(event);
}

function leaveTextBox({ target }: KeyboardEvent): boolean {
  if (target instanceof HTMLElement) {
    target.blur();
  }
  focused(rowAt(globalThis.location.hash));
  return true;
}

function rowOrNewest(address: string): () => unknown {
  return () => globalThis.document.querySelector(rowAt(address)) ?? globalThis.document.querySelector(ROWS);
}

function back({ selected, watch }: Pick<InboxKeys, "selected" | "watch">): Act {
  return () => {
    if (!selected || !isNarrowWindow()) {
      return false;
    }
    watch(rowOrNewest(globalThis.location.hash));
    globalThis.location.hash = hrefOf({ name: "inbox", selected: null });
    return true;
  };
}

function press({ conversation, keymap }: Pick<InboxKeys, "conversation" | "keymap">, action: Action): Act {
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

function thenNext(act: Act): Act {
  const next = select("next");
  return (event) => {
    if (!act(event)) {
      return false;
    }
    next(event);
    return true;
  };
}

function useInboxKeys(keys: InboxKeys): void {
  const { conversation, keymap, selected, watch } = keys;
  useEffect(() => {
    const unbindRows = keymap.bind({
      actions: {
        backToRows: back({ selected, watch }),
        copyMessageLink: onTopMessage({ conversation, keymap }, "copyMessageLink"),
        markRowRead: thenNext(press({ conversation, keymap }, "markRowRead")),
        markRowUnread: press({ conversation, keymap }, "markRowUnread"),
        markSelectedRowRead: press({ conversation, keymap }, "markRowRead"),
        nextRow: select("next"),
        openRow: press({ conversation, keymap }, "openRow"),
        openThread: focusIn(conversation, TOP_MESSAGE),
        previousRow: select("previous"),
        replyToRow: focusIn(conversation, REPLY_BOX),
        toggleThreadClosed: onTopMessage({ conversation, keymap }, "toggleThreadClosed"),
        toggleThumbsDown: onTopMessage({ conversation, keymap }, "toggleThumbsDown"),
        toggleThumbsUp: onTopMessage({ conversation, keymap }, "toggleThumbsUp"),
      },
      scope: "inbox",
    });
    const unbindTextBox = keymap.bind({ actions: { leaveTextBox }, scope: "text box" });
    return (): void => {
      unbindRows();
      unbindTextBox();
    };
  }, [conversation, keymap, selected, watch]);
}

export { type InboxKeys, useInboxKeys };
