import type { Act, Action, Keymap } from "../../keymap/index.ts";
import { useContext, useLayoutEffect } from "react";
import type { InboxSelection } from "../../paths/index.ts";
import type { MessageActions } from "./message-actions.ts";
import { MessageChoices } from "./message-actions.ts";
import { chooseOn } from "./message-keys.ts";
import { hrefOf } from "../../paths/index.ts";
import { isNarrowWindow } from "./narrow-window.ts";

const ROWS = "a[data-feed-row]";
const INBOX_ROW = "#/inbox/";
const CONTROLS = "a, button";
const REPLY_BOX = "textarea";
const TEXT_FIELDS = "input, select, textarea, [contenteditable]";
const TOP_MESSAGE = 'article[aria-label="First message"]';
const FIRST = 0;
const STEPS = { next: 1, previous: -1 } as const;
const NOT_FOUND = -1;
const QUERY = "?";
const WAIT_MS = 10_000;
const WATCHED = { childList: true, subtree: true } as const;

interface InboxKeys {
  readonly keymap: Keymap;
  readonly selected: InboxSelection | null;
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

function addressNow(): string {
  const [address = ""] = globalThis.location.hash.split(QUERY);
  return address;
}

function focusWhenShown(selector: string, old: unknown): void {
  const control = new AbortController();
  const observer = new MutationObserver(() => {
    const now = globalThis.document.querySelector(selector);
    if (now instanceof HTMLElement && now !== old) {
      control.abort();
      now.focus();
    }
  });
  const signal = AbortSignal.any([control.signal, AbortSignal.timeout(WAIT_MS)]);
  signal.addEventListener("abort", () => {
    observer.disconnect();
  });
  globalThis.document.addEventListener(
    "focusin",
    () => {
      control.abort();
    },
    { capture: true, signal },
  );
  observer.observe(globalThis.document.body, WATCHED);
}

function focusIn(keys: Pick<InboxKeys, "conversation" | "selected">, selector: string): Act {
  const inIt = inConversation(keys.conversation, selector);
  const shown = hrefOf({ name: "inbox", selected: keys.selected });
  return ({ target }) => {
    if (onAControl(target)) {
      return false;
    }
    if (shown === addressNow() && focused(inIt)) {
      return true;
    }
    if (keys.selected === null) {
      return false;
    }
    focusWhenShown(inIt, globalThis.document.querySelector(inIt));
    return true;
  };
}

interface TopMessage extends Pick<InboxKeys, "conversation" | "keymap"> {
  readonly actions: MessageActions;
}

function onTopMessage({ actions, conversation, keymap }: TopMessage, action: Action): Act {
  const choose = chooseOn({
    action,
    actions,
    keymap,
    messageOf: () => globalThis.document.querySelector(inConversation(conversation, TOP_MESSAGE)),
  });
  return (event) => !onAControl(event.target) && choose(event);
}

function leaveTextBox({ target }: KeyboardEvent): boolean {
  if (target instanceof HTMLElement) {
    target.blur();
  }
  focused(rowAt(addressNow()));
  return true;
}

function rowOrNewest(address: string): () => unknown {
  return () => globalThis.document.querySelector(rowAt(address)) ?? globalThis.document.querySelector(ROWS);
}

function back({ selected, watch }: Pick<InboxKeys, "selected" | "watch">): Act {
  return () => {
    if (selected === null || !isNarrowWindow()) {
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

function offTextField(act: Act): Act {
  return (event) => {
    const { target } = event;
    return !(target instanceof HTMLElement && target.matches(TEXT_FIELDS)) && act(event);
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
  const actions = useContext(MessageChoices);
  useLayoutEffect(() => {
    const unbindRows = keymap.bind({
      actions: {
        backToRows: back({ selected, watch }),
        copyMessageLink: onTopMessage({ actions, conversation, keymap }, "copyMessageLink"),
        markRowRead: thenNext(press({ conversation, keymap }, "markRowRead")),
        markRowUnread: offTextField(press({ conversation, keymap }, "markRowUnread")),
        markSelectedRowRead: press({ conversation, keymap }, "markRowRead"),
        nextRow: select("next"),
        openRow: press({ conversation, keymap }, "openRow"),
        openThread: focusIn({ conversation, selected }, TOP_MESSAGE),
        previousRow: select("previous"),
        replyToRow: focusIn({ conversation, selected }, REPLY_BOX),
        toggleThreadClosed: onTopMessage({ actions, conversation, keymap }, "toggleThreadClosed"),
        toggleThumbsDown: onTopMessage({ actions, conversation, keymap }, "toggleThumbsDown"),
        toggleThumbsUp: onTopMessage({ actions, conversation, keymap }, "toggleThumbsUp"),
      },
      scope: "inbox",
    });
    const unbindTextBox = keymap.bind({ actions: { leaveTextBox }, scope: "text box" });
    return (): void => {
      unbindRows();
      unbindTextBox();
    };
  }, [actions, conversation, keymap, selected, watch]);
}

export { type InboxKeys, useInboxKeys };
